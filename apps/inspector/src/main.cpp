#include <ixwebsocket/IXNetSystem.h>
#include <ixwebsocket/IXWebSocketServer.h>

#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>

namespace {
std::atomic<bool> g_running{true};

struct Options {
  std::string backend = "mock";
  std::string ws_bind = ":8765";
  std::string log_path;
  std::string run_loop;
  std::int32_t demo_ticks = 0;
  std::int32_t tick_ms = 250;
  bool quiet = false;
};

struct BindAddress {
  std::string host;
  std::uint16_t port;
};

void OnSignal(int /*signal*/) {
  g_running.store(false);
}

std::int64_t UnixMsNow() {
  const auto now = std::chrono::time_point_cast<std::chrono::milliseconds>(std::chrono::system_clock::now());
  return static_cast<std::int64_t>(now.time_since_epoch().count());
}

std::string JsonEscape(const std::string& input) {
  std::ostringstream escaped;
  for (const char c : input) {
    switch (c) {
      case '\\':
        escaped << "\\\\";
        break;
      case '"':
        escaped << "\\\"";
        break;
      case '\n':
        escaped << "\\n";
        break;
      case '\r':
        escaped << "\\r";
        break;
      case '\t':
        escaped << "\\t";
        break;
      default:
        escaped << c;
        break;
    }
  }
  return escaped.str();
}

std::string UsageText() {
  return "Usage: mbt_inspector [--connect <backend>] [--ws <host:port|:port>] [--log <path>] "
         "[--run-loop <cfg>] [--demo-ticks <n>] [--tick-ms <n>] [--quiet]";
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
    } else if (arg == "--connect") {
      options.backend = nextValue(arg);
    } else if (arg == "--ws") {
      options.ws_bind = nextValue(arg);
    } else if (arg == "--log") {
      options.log_path = nextValue(arg);
    } else if (arg == "--run-loop") {
      options.run_loop = nextValue(arg);
    } else if (arg == "--demo-ticks") {
      options.demo_ticks = std::stoi(nextValue(arg));
      if (options.demo_ticks < 0) {
        ThrowUsageError("--demo-ticks must be >= 0");
      }
    } else if (arg == "--tick-ms") {
      options.tick_ms = std::stoi(nextValue(arg));
      if (options.tick_ms <= 0) {
        ThrowUsageError("--tick-ms must be > 0");
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

std::string BuildEnvelope(const std::string& type, const std::string& run_id, std::int64_t unix_ms,
                          std::uint64_t seq, std::optional<std::int32_t> tick, const std::string& data_json) {
  std::ostringstream out;
  out << "{"
      << "\"schema\":\"mbt.evt.v1\","
      << "\"type\":\"" << type << "\","
      << "\"run_id\":\"" << JsonEscape(run_id) << "\","
      << "\"unix_ms\":" << unix_ms << ','
      << "\"seq\":" << seq;

  if (tick.has_value()) {
    out << ",\"tick\":" << *tick;
  }

  out << ",\"data\":" << data_json << '}';
  return out.str();
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const Options options = ParseArgs(argc, argv);
    const BindAddress bind = ParseBindAddress(options.ws_bind);

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

    ix::WebSocketServer server(bind.port, bind.host);
    server.setOnClientMessageCallback(
        [&](std::shared_ptr<ix::ConnectionState> connection_state, ix::WebSocket& /*websocket*/,
            const ix::WebSocketMessagePtr& msg) {
          if (options.quiet) {
            return;
          }

          if (msg->type == ix::WebSocketMessageType::Open) {
            std::cerr << "client connected: " << connection_state->getId() << "\n";
          } else if (msg->type == ix::WebSocketMessageType::Close) {
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
      std::cerr << "mbt_inspector listening on ws://" << bind.host << ':' << bind.port << " (path /events accepted)\n";
      std::cerr << "backend=" << options.backend << " run_loop=" << options.run_loop << "\n";
    }

    std::uint64_t seq = 0;
    std::int32_t tick = 0;
    const std::string run_id = "run-" + std::to_string(UnixMsNow());

    auto emit = [&](const std::string& payload) {
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

    {
      std::ostringstream data;
      const double tick_hz = 1000.0 / static_cast<double>(options.tick_ms);
      data << "{"
           << "\"git_sha\":\"dev\","
           << "\"host\":\"mbt_inspector\","
           << "\"tick_hz\":" << tick_hz << ','
           << "\"tree_hash\":\"demo-tree-v1\","
           << "\"backend\":\"" << JsonEscape(options.backend) << "\""
           << '}';

      emit(BuildEnvelope("run_start", run_id, UnixMsNow(), seq++, std::nullopt, data.str()));
    }

    {
      const std::string data =
          "{"
          "\"nodes\":["
          "{\"id\":\"root\",\"name\":\"Root\",\"kind\":\"Sequence\"},"
          "{\"id\":\"nav\",\"name\":\"Navigate\",\"kind\":\"Action\",\"parent_id\":\"root\"},"
          "{\"id\":\"pickup\",\"name\":\"PickUp\",\"kind\":\"Action\",\"parent_id\":\"root\"}"
          "],"
          "\"edges\":["
          "{\"from\":\"root\",\"to\":\"nav\"},"
          "{\"from\":\"root\",\"to\":\"pickup\"}"
          "],"
          "\"dsl\":\"sequence(root){ nav(); pickup(); }\""
          "}";

      emit(BuildEnvelope("bt_def", run_id, UnixMsNow(), seq++, std::nullopt, data));
    }

    while (g_running.load() && (options.demo_ticks == 0 || tick < options.demo_ticks)) {
      const auto tick_start_ms = UnixMsNow();

      emit(BuildEnvelope("tick_begin", run_id, UnixMsNow(), seq++, tick, "{}"));
      emit(BuildEnvelope("node_status", run_id, UnixMsNow(), seq++, tick,
                         "{\"node_id\":\"root\",\"status\":\"running\"}"));

      if (tick % 2 == 0) {
        emit(BuildEnvelope("node_status", run_id, UnixMsNow(), seq++, tick,
                           "{\"node_id\":\"nav\",\"status\":\"success\",\"outcome\":\"ok\"}"));
        emit(BuildEnvelope("bb_write", run_id, UnixMsNow(), seq++, tick,
                           "{\"key\":\"target\",\"digest\":\"sha256:live-demo\",\"preview\":\"goal:A\"}"));
        emit(BuildEnvelope("node_status", run_id, UnixMsNow(), seq++, tick,
                           "{\"node_id\":\"root\",\"status\":\"success\",\"outcome\":\"ok\"}"));
      } else {
        emit(BuildEnvelope(
            "node_status", run_id, UnixMsNow(), seq++, tick,
            "{\"node_id\":\"pickup\",\"status\":\"failure\",\"outcome\":\"error\",\"message\":\"live demo failure\"}"));
        emit(BuildEnvelope("bb_delete", run_id, UnixMsNow(), seq++, tick,
                           "{\"key\":\"target\",\"reason\":\"live demo clear\"}"));
        emit(BuildEnvelope("error", run_id, UnixMsNow(), seq++, tick,
                           "{\"severity\":\"warning\",\"message\":\"pickup failed\",\"node_id\":\"pickup\"}"));
      }

      const auto tick_wall_ms = UnixMsNow() - tick_start_ms;
      emit(BuildEnvelope("tick_end", run_id, UnixMsNow(), seq++, tick,
                         "{\"wall_ms\":" + std::to_string(tick_wall_ms) + '}'));

      tick += 1;
      std::this_thread::sleep_for(std::chrono::milliseconds(options.tick_ms));
    }

    server.stop();
    ix::uninitNetSystem();
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
