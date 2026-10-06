#!/bin/bash
# Runs IELTS Coach as the launchd agent local.ielts-coach: starts when the Mac logs in and
# restarts if it stops. Only reachable from this Mac (127.0.0.1:3232).
# Control it with: npm run service:start | service:stop | service:restart | service:logs
# Logs: ~/Library/Logs/ielts-coach/server.log (rotated past 10 MB).
set -u
cd "$(dirname "$0")/.."

LOG_DIR="$HOME/Library/Logs/ielts-coach"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/server.log"
if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG")" -gt 10485760 ]; then
  mv "$LOG" "$LOG.1"
fi

# launchd starts with a bare PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOST="127.0.0.1"
export PORT="${PORT:-3232}"

echo "--- $(date '+%Y-%m-%d %H:%M:%S') starting IELTS Coach on $HOST:$PORT" >> "$LOG"
exec node server.js >> "$LOG" 2>&1
