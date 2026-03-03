#include <bt/compiler.hpp>
#include <bt/event_log.hpp>
#include <bt/runtime_host.hpp>
#if MBT_INSPECTOR_HAS_PYBULLET_INTEGRATION
#include <pybullet/racecar_demo.hpp>
#endif
#if MBT_INSPECTOR_HAS_WEBOTS_INTEGRATION
#include <webots/extension.hpp>
#endif

#include <ixwebsocket/IXNetSystem.h>
#include <ixwebsocket/IXWebSocketCloseConstants.h>
#include <ixwebsocket/IXWebSocketServer.h>

#include <muslisp/reader.hpp>
#include <muslisp/value.hpp>

#include <atomic>
#include <chrono>
#include <cctype>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <mutex>
#include <optional>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace {
std::atomic<bool> g_running{true};

constexpr const char* kDefaultTreeDsl =
    "(sel (seq (cond target-visible) (act approach-target) (act grasp)) (act search-target))";
constexpr const char* kPybulletTreeDsl = "(sel (seq (cond collision-imminent) (act avoid-obstacle)) (act constant-drive))";

struct Options {
  std::string backend = "mock";
  std::string ws_bind = ":8765";
  std::string log_path;
  std::string run_loop;
  std::optional<double> tick_hz;
  std::optional<std::uint64_t> seed;
  std::int32_t startup_delay_ms = 0;
  bool quiet = false;
};

struct RunLoopConfig {
  std::int64_t max_ticks = 0;
  double tick_hz = 20.0;
  std::string tree_dsl;
};

struct BindAddress {
  std::string host;
  std::uint16_t port;
};

struct ReplayCache {
  std::mutex mutex;
  std::optional<std::string> run_start;
  std::optional<std::string> bt_def;
};

void OnSignal(int /*signal*/) {
  g_running.store(false);
}

std::int64_t UnixMsNow() {
  const auto now = std::chrono::time_point_cast<std::chrono::milliseconds>(std::chrono::system_clock::now());
  return static_cast<std::int64_t>(now.time_since_epoch().count());
}

std::string ReadTextFile(const std::string& path) {
  std::ifstream in(path, std::ios::in | std::ios::binary);
  if (!in.good()) {
    throw std::runtime_error("Unable to read file: " + path);
  }

  std::ostringstream buffer;
  buffer << in.rdbuf();
  if (!in.good() && !in.eof()) {
    throw std::runtime_error("Failed while reading file: " + path);
  }

  return buffer.str();
}

std::string Trim(std::string text) {
  const auto is_space = [](unsigned char ch) { return std::isspace(ch) != 0; };

  while (!text.empty() && is_space(static_cast<unsigned char>(text.front()))) {
    text.erase(text.begin());
  }
  while (!text.empty() && is_space(static_cast<unsigned char>(text.back()))) {
    text.pop_back();
  }
  return text;
}

std::string UnescapeJsonString(std::string_view escaped) {
  std::string out;
  out.reserve(escaped.size());

  for (std::size_t index = 0; index < escaped.size(); ++index) {
    const char ch = escaped[index];
    if (ch != '\\') {
      out.push_back(ch);
      continue;
    }

    if (index + 1 >= escaped.size()) {
      out.push_back('\\');
      break;
    }

    index += 1;
    const char esc = escaped[index];
    switch (esc) {
      case '"':
        out.push_back('"');
        break;
      case '\\':
        out.push_back('\\');
        break;
      case '/':
        out.push_back('/');
        break;
      case 'b':
        out.push_back('\b');
        break;
      case 'f':
        out.push_back('\f');
        break;
      case 'n':
        out.push_back('\n');
        break;
      case 'r':
        out.push_back('\r');
        break;
      case 't':
        out.push_back('\t');
        break;
      default:
        out.push_back(esc);
        break;
    }
  }

  return out;
}

std::optional<std::string> ExtractJsonString(const std::string& text, const std::string& key) {
  const std::regex pattern("\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
  std::smatch match;
  if (!std::regex_search(text, match, pattern)) {
    return std::nullopt;
  }

  if (match.size() < 2) {
    return std::nullopt;
  }

  return UnescapeJsonString(match[1].str());
}

std::optional<std::int64_t> ExtractJsonInteger(const std::string& text, const std::string& key) {
  const std::regex pattern("\"" + key + "\"\\s*:\\s*(-?[0-9]+)");
  std::smatch match;
  if (!std::regex_search(text, match, pattern)) {
    return std::nullopt;
  }

  if (match.size() < 2) {
    return std::nullopt;
  }

  return std::stoll(match[1].str());
}

std::optional<double> ExtractJsonDouble(const std::string& text, const std::string& key) {
  const std::regex pattern("\"" + key + "\"\\s*:\\s*(-?(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+))");
  std::smatch match;
  if (!std::regex_search(text, match, pattern)) {
    return std::nullopt;
  }

  if (match.size() < 2) {
    return std::nullopt;
  }

  return std::stod(match[1].str());
}

RunLoopConfig ParseRunLoopConfig(const std::string& value) {
  RunLoopConfig config;
  if (value.empty()) {
    return config;
  }

  std::string source = value;
  if (std::filesystem::exists(value)) {
    source = ReadTextFile(value);
  }

  const std::string trimmed = Trim(source);
  if (trimmed.empty()) {
    return config;
  }

  if (!trimmed.empty() && trimmed.front() != '{') {
    config.tree_dsl = trimmed;
    return config;
  }

  if (const auto max_ticks = ExtractJsonInteger(trimmed, "max_ticks"); max_ticks.has_value()) {
    config.max_ticks = *max_ticks;
  } else if (const auto max_ticks = ExtractJsonInteger(trimmed, "maxTicks"); max_ticks.has_value()) {
    config.max_ticks = *max_ticks;
  }

  if (config.max_ticks < 0) {
    throw std::runtime_error("run-loop config: max_ticks must be >= 0");
  }

  if (const auto tick_hz = ExtractJsonDouble(trimmed, "tick_hz"); tick_hz.has_value()) {
    config.tick_hz = *tick_hz;
  } else if (const auto tick_hz = ExtractJsonDouble(trimmed, "tickHz"); tick_hz.has_value()) {
    config.tick_hz = *tick_hz;
  }

  if (config.tick_hz <= 0.0) {
    throw std::runtime_error("run-loop config: tick_hz must be > 0");
  }

  if (const auto tree_dsl = ExtractJsonString(trimmed, "tree_dsl"); tree_dsl.has_value() && !tree_dsl->empty()) {
    config.tree_dsl = *tree_dsl;
  } else if (const auto dsl = ExtractJsonString(trimmed, "dsl"); dsl.has_value() && !dsl->empty()) {
    config.tree_dsl = *dsl;
  }

  return config;
}

std::string DefaultTreeDslForBackend(const std::string& backend) {
  if (backend == "pybullet") {
    return kPybulletTreeDsl;
  }
  return kDefaultTreeDsl;
}

std::string UsageText() {
  return "Usage: mbt_inspector [--attach <backend>] [--ws <host:port|:port>] [--log <path>] "
         "[--tick-hz <n>] [--run-loop <cfg-json-or-file>] [--seed <n>] [--startup-delay-ms <n>] [--quiet]";
}

[[noreturn]] void ThrowUsageError(const std::string& message) {
  throw std::runtime_error(message + "\n" + UsageText());
}

Options ParseArgs(int argc, char** argv) {
  Options options;

  for (int index = 1; index < argc; ++index) {
    const std::string arg = argv[index];

    auto nextValue = [&](const std::string& flag) -> std::string {
      if (index + 1 >= argc) {
        ThrowUsageError("Missing value for " + flag);
      }
      index += 1;
      return argv[index];
    };

    if (arg == "--help" || arg == "-h") {
      std::cout << UsageText() << '\n';
      std::exit(0);
    } else if (arg == "--attach" || arg == "--connect") {
      options.backend = nextValue(arg);
    } else if (arg == "--ws") {
      options.ws_bind = nextValue(arg);
    } else if (arg == "--log") {
      options.log_path = nextValue(arg);
    } else if (arg == "--run-loop") {
      options.run_loop = nextValue(arg);
    } else if (arg == "--tick-hz") {
      options.tick_hz = std::stod(nextValue(arg));
      if (!options.tick_hz.has_value() || *options.tick_hz <= 0.0) {
        ThrowUsageError("--tick-hz must be > 0");
      }
    } else if (arg == "--seed") {
      const std::int64_t raw_seed = std::stoll(nextValue(arg));
      if (raw_seed < 0) {
        ThrowUsageError("--seed must be >= 0");
      }
      options.seed = static_cast<std::uint64_t>(raw_seed);
    } else if (arg == "--startup-delay-ms") {
      options.startup_delay_ms = std::stoi(nextValue(arg));
      if (options.startup_delay_ms < 0) {
        ThrowUsageError("--startup-delay-ms must be >= 0");
      }
    } else if (arg == "--quiet") {
      options.quiet = true;
    } else {
      ThrowUsageError("Unknown argument: " + arg);
    }
  }

  return options;
}

BindAddress ParseBindAddress(const std::string& value) {
  std::string host = "0.0.0.0";
  std::string port_text;

  if (!value.empty() && value.front() == ':') {
    port_text = value.substr(1);
  } else {
    const auto last_colon = value.rfind(':');
    if (last_colon == std::string::npos) {
      throw std::runtime_error("Invalid --ws value. Expected <host:port> or :<port>");
    }

    host = value.substr(0, last_colon);
    port_text = value.substr(last_colon + 1);
    if (host.empty()) {
      host = "0.0.0.0";
    }
  }

  if (port_text.empty()) {
    throw std::runtime_error("Invalid --ws value: port is empty");
  }

  const int port = std::stoi(port_text);
  if (port <= 0 || port > 65535) {
    throw std::runtime_error("Invalid --ws value: port must be 1..65535");
  }

  return {host, static_cast<std::uint16_t>(port)};
}

void CacheBootstrapLine(ReplayCache& cache, const std::string& payload) {
  if (payload.find("\"type\":\"run_start\"") != std::string::npos) {
    std::lock_guard<std::mutex> lock(cache.mutex);
    cache.run_start = payload;
    return;
  }

  if (payload.find("\"type\":\"bt_def\"") != std::string::npos) {
    std::lock_guard<std::mutex> lock(cache.mutex);
    cache.bt_def = payload;
  }
}

void AttachBackend(bt::runtime_host& host, const std::string& backend) {
  if (backend == "mock" || backend == "demo") {
    bt::install_demo_callbacks(host);
    return;
  }

  if (backend == "pybullet") {
#if MBT_INSPECTOR_HAS_PYBULLET_INTEGRATION
    bt::install_demo_callbacks(host);
    bt::install_racecar_demo_callbacks(host);
    return;
#else
    throw std::runtime_error(
        "Unsupported backend: pybullet (muesli-bt integration target muesli_bt::integration_pybullet is unavailable)");
#endif
  }

  if (backend == "webots") {
#if MBT_INSPECTOR_HAS_WEBOTS_INTEGRATION
    bt::install_demo_callbacks(host);
    bt::integrations::webots::install_callbacks(host);
    return;
#else
    throw std::runtime_error(
        "Unsupported backend: webots (muesli-bt integration target muesli_bt::integration_webots is unavailable)");
#endif
  }

  throw std::runtime_error("Unsupported backend: " + backend + " (expected one of: mock, demo, pybullet, webots)");
}

muslisp::value ResolveTreeFormFromDsl(const std::string& dsl_text) {
  const std::vector<muslisp::value> exprs = muslisp::read_all(dsl_text);
  if (exprs.empty()) {
    throw std::runtime_error("run-loop tree DSL did not contain any expressions");
  }

  muslisp::value form = exprs.front();
  if (!muslisp::is_proper_list(form)) {
    return form;
  }

  const std::vector<muslisp::value> items = muslisp::vector_from_list(form);
  if (items.size() >= 3 && muslisp::is_symbol(items[0]) && muslisp::symbol_name(items[0]) == "defbt") {
    return items[2];
  }

  return form;
}

void EmitInspectorError(bt::event_log& events, std::optional<std::uint64_t> tick, const std::string& message) {
  std::ostringstream data;
  data << "{\"severity\":\"error\",\"message\":\"" << bt::event_log::json_escape(message) << "\"}";
  (void)events.emit("error", tick, data.str());
}

void CloseClientsGracefully(ix::WebSocketServer& server) {
  for (const auto& client : server.getClients()) {
    if (client) {
      client->close(ix::WebSocketCloseConstants::kNormalClosureCode, "inspector shutting down");
    }
  }
  std::this_thread::sleep_for(std::chrono::milliseconds(50));
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const Options options = ParseArgs(argc, argv);
    const BindAddress bind = ParseBindAddress(options.ws_bind);
    RunLoopConfig run_loop = ParseRunLoopConfig(options.run_loop);
    if (run_loop.tree_dsl.empty()) {
      run_loop.tree_dsl = DefaultTreeDslForBackend(options.backend);
    }

    if (options.tick_hz.has_value()) {
      run_loop.tick_hz = *options.tick_hz;
    }

    std::signal(SIGINT, OnSignal);
    std::signal(SIGTERM, OnSignal);

    std::ofstream log_file;
    if (!options.log_path.empty()) {
      log_file.open(options.log_path, std::ios::out | std::ios::trunc);
      if (!log_file.good()) {
        throw std::runtime_error("Unable to open log path: " + options.log_path);
      }
    }

    ix::initNetSystem();

    ReplayCache replay_cache;

    ix::WebSocketServer server(bind.port, bind.host);
    server.setOnClientMessageCallback(
        [&](std::shared_ptr<ix::ConnectionState> connection_state, ix::WebSocket& websocket,
            const ix::WebSocketMessagePtr& msg) {
          if (msg->type == ix::WebSocketMessageType::Open) {
            if (!options.quiet) {
              std::cerr << "client connected: " << connection_state->getId() << "\n";
            }

            std::lock_guard<std::mutex> lock(replay_cache.mutex);
            if (replay_cache.run_start.has_value()) {
              websocket.send(*replay_cache.run_start);
            }
            if (replay_cache.bt_def.has_value()) {
              websocket.send(*replay_cache.bt_def);
            }
          } else if (msg->type == ix::WebSocketMessageType::Close && !options.quiet) {
            std::cerr << "client disconnected: " << connection_state->getId() << "\n";
          }
        });

    auto listen_result = server.listen();
    if (!listen_result.first) {
      ix::uninitNetSystem();
      throw std::runtime_error("Failed to listen on " + bind.host + ":" + std::to_string(bind.port) +
                               ": " + listen_result.second);
    }

    server.start();

    if (!options.quiet) {
      std::cerr << "mbt_inspector listening on ws://" << bind.host << ':' << bind.port
                << " (path /events accepted)\n";
      std::cerr << "backend=" << options.backend << " tick_hz=" << run_loop.tick_hz << " max_ticks="
                << run_loop.max_ticks << "\n";
    }

    auto publish_line = [&](const std::string& payload) {
      CacheBootstrapLine(replay_cache, payload);

      if (log_file.good()) {
        log_file << payload << '\n';
        log_file.flush();
      }

      for (const auto& client : server.getClients()) {
        if (client) {
          client->send(payload);
        }
      }

      if (!options.quiet) {
        std::cout << payload << '\n';
      }
    };

    bt::runtime_host host;
    host.events().set_line_listener([&](const std::string& line) { publish_line(line); });
    host.events().set_file_enabled(false);
    host.events().set_git_sha("muesli-studio");
    host.events().set_host_info("mbt_inspector", "runtime", options.backend);
    host.events().set_tick_hz(run_loop.tick_hz);

    if (options.seed.has_value()) {
      host.enable_deterministic_test_mode(*options.seed, "run-seed-" + std::to_string(*options.seed), 1735689600000, 1);
    } else {
      host.events().set_run_id("run-" + std::to_string(UnixMsNow()));
    }

    int exit_code = 0;

    try {
      AttachBackend(host, options.backend);
    } catch (const std::exception& error) {
      EmitInspectorError(host.events(), std::nullopt, std::string("attach failed: ") + error.what());
      exit_code = 1;
    }

    std::int64_t instance_handle = -1;
    if (exit_code == 0) {
      try {
        const muslisp::value tree_form = ResolveTreeFormFromDsl(run_loop.tree_dsl);
        bt::definition def = bt::compile_definition(tree_form);
        const std::int64_t definition_handle = host.store_definition(std::move(def));
        instance_handle = host.create_instance(definition_handle);
      } catch (const std::exception& error) {
        EmitInspectorError(host.events(), std::nullopt, std::string("runtime initialisation failed: ") + error.what());
        exit_code = 1;
      }
    }

    if (exit_code == 0 && options.startup_delay_ms > 0) {
      std::this_thread::sleep_for(std::chrono::milliseconds(options.startup_delay_ms));
    }

    if (exit_code == 0) {
      const auto tick_period = std::chrono::duration_cast<std::chrono::steady_clock::duration>(
          std::chrono::duration<double>(1.0 / run_loop.tick_hz));
      auto next_tick = std::chrono::steady_clock::now();

      for (std::int64_t tick_count = 0; g_running.load(); ++tick_count) {
        if (run_loop.max_ticks > 0 && tick_count >= run_loop.max_ticks) {
          break;
        }

        try {
          (void)host.tick_instance(instance_handle);
        } catch (const std::exception& error) {
          EmitInspectorError(host.events(), std::nullopt, std::string("runtime tick failed: ") + error.what());
          exit_code = 1;
          break;
        }

        if (!g_running.load()) {
          break;
        }

        next_tick += tick_period;
        std::this_thread::sleep_until(next_tick);
      }
    }

    host.events().clear_line_listener();
    CloseClientsGracefully(server);
    server.stop();
    ix::uninitNetSystem();
    return exit_code;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
