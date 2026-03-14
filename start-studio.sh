#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
usage:
  ./start-studio.sh [demo|app] [--port <port>] [--host <host>] [--no-open]

commands:
  demo  repo mode only; validates and opens the polished demo fixture (default in the repo)
  app   starts the studio UI without preloading a fixture (default in release bundles)

options:
  --port <port>  override the local HTTP port
  --host <host>  override the bind host (default: 127.0.0.1)
  --no-open      do not open the browser automatically
  --help         show this help text

examples:
  ./start-studio.sh
  ./start-studio.sh demo
  ./start-studio.sh app --port 4173
EOF
}

die() {
  printf 'start-studio: %s\n' "$*" >&2
  exit 1
}

detect_layout() {
  if [[ -f "${script_dir}/package.json" && -d "${script_dir}/apps/studio" ]]; then
    printf 'repo\n'
    return
  fi

  if [[ -d "${script_dir}/studio/dist" ]]; then
    printf 'bundle\n'
    return
  fi

  die "unsupported layout; expected repo root or release bundle root"
}

resolve_python() {
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi

  if command -v python >/dev/null 2>&1; then
    command -v python
    return
  fi

  die "python3 (or python) is required to serve the bundled studio UI"
}

open_url() {
  local url="$1"

  if [[ "${no_open}" == "1" ]]; then
    printf 'studio url: %s\n' "${url}"
    return
  fi

  if command -v open >/dev/null 2>&1; then
    open "${url}" >/dev/null 2>&1 || true
    return
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${url}" >/dev/null 2>&1 || true
    return
  fi

  printf 'studio url: %s\n' "${url}"
}

require_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    return
  fi

  die "pnpm is required in repo mode; run with your normal Node toolchain on PATH"
}

stage_demo_fixture() {
  local source_dir="${script_dir}/tests/fixtures/studio_demo"
  local target_dir="${script_dir}/apps/studio/public/demo/studio_demo"

  [[ -d "${source_dir}" ]] || die "demo fixture missing: ${source_dir}"

  rm -rf "${target_dir}"
  mkdir -p "$(dirname "${target_dir}")"
  cp -R "${source_dir}" "${target_dir}"
}

run_repo_command() {
  local command_name="$1"
  local open_path="/"

  require_pnpm
  cd "${script_dir}"

  case "${command_name}" in
    demo)
      stage_demo_fixture
      printf 'Validating demo fixture bundle...\n'
      pnpm studio inspect tests/fixtures/studio_demo
      open_path='/?demo_fixture=/demo/studio_demo/events.jsonl'
      ;;
    app)
      ;;
    *)
      die "unknown repo command: ${command_name}"
      ;;
  esac

  printf 'Starting studio dev server on http://%s:%s%s\n' "${host}" "${port}" "${open_path}"

  if [[ "${no_open}" == "1" ]]; then
    exec pnpm --filter @muesli/studio dev --host "${host}" --port "${port}"
  fi

  exec pnpm --filter @muesli/studio dev --host "${host}" --port "${port}" --open "${open_path}"
}

run_bundle_command() {
  local command_name="$1"
  local python_bin
  local server_pid
  local url="http://${host}:${port}/"

  case "${command_name}" in
    app)
      ;;
    demo)
      die "demo mode is only available from the repo checkout"
      ;;
    *)
      die "unknown bundle command: ${command_name}"
      ;;
  esac

  python_bin="$(resolve_python)"
  cd "${script_dir}"

  printf 'Serving bundled studio UI on %s\n' "${url}"
  "${python_bin}" -m http.server "${port}" --bind "${host}" --directory "${script_dir}/studio/dist" &
  server_pid=$!
  trap 'kill "${server_pid}" >/dev/null 2>&1 || true' EXIT INT TERM

  sleep 1
  open_url "${url}"
  printf 'Press Ctrl-C to stop.\n'
  wait "${server_pid}"
}

layout="$(detect_layout)"
host="127.0.0.1"
port=""
no_open="0"
command_name=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    demo|app)
      if [[ -n "${command_name}" ]]; then
        die "only one command may be supplied"
      fi
      command_name="$1"
      shift
      ;;
    --port)
      [[ $# -ge 2 ]] || die "missing value for --port"
      port="$2"
      shift 2
      ;;
    --host)
      [[ $# -ge 2 ]] || die "missing value for --host"
      host="$2"
      shift 2
      ;;
    --no-open)
      no_open="1"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

if [[ -z "${command_name}" ]]; then
  if [[ "${layout}" == "repo" ]]; then
    command_name="demo"
  else
    command_name="app"
  fi
fi

if [[ -z "${port}" ]]; then
  if [[ "${layout}" == "repo" ]]; then
    port="5173"
  else
    port="4173"
  fi
fi

if [[ ! "${port}" =~ ^[0-9]+$ ]]; then
  die "--port must be a numeric value"
fi

case "${layout}" in
  repo)
    run_repo_command "${command_name}"
    ;;
  bundle)
    run_bundle_command "${command_name}"
    ;;
  *)
    die "unsupported layout: ${layout}"
    ;;
esac
