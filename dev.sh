#!/usr/bin/env bash
# Starts both dev servers: API on :5000, web on :3000.
#
#   ./dev.sh           both with hot reload
#   ./dev.sh --debug   API under Bun's inspector (prints a debug.bun.sh URL), web unchanged
#
# Each app reads its own .env (apps/api/.env, apps/web/.env) — nothing is set here.
set -euo pipefail
cd "$(dirname "$0")"

# One filter per app, not `--filter '*' dev`: apps/web depends on @gc/api (type-only,
# but a real edge to Bun), and --filter runs scripts in dependency order — it would
# wait for the API's dev script to exit before starting the web one, i.e. forever.
api_script=dev
[[ "${1:-}" == "--debug" ]] && api_script=dev:debug

# Take down the whole process group on exit, so neither server outlives Ctrl-C.
trap 'trap - EXIT; kill 0' EXIT INT TERM

bun run --filter '@gc/api' "$api_script" &
bun run --filter '@gc/web' dev &
wait
