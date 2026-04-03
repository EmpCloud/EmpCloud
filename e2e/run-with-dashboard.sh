#!/bin/bash
# ============================================================
# EMP Cloud E2E Test Dashboard Launcher
# ============================================================
# Starts a local HTTP server for the live dashboard, then
# runs Playwright tests with the custom dashboard reporter.
#
# Usage:
#   bash e2e/run-with-dashboard.sh                    # run all tests
#   bash e2e/run-with-dashboard.sh e2e/e2e-auth*      # run specific specs
#   bash e2e/run-with-dashboard.sh --workers=4        # custom workers
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DASHBOARD_PORT="${DASHBOARD_PORT:-3333}"
DASHBOARD_OUTPUT_DIR="${DASHBOARD_OUTPUT_DIR:-$SCRIPT_DIR}"
RESULTS_FILE="$DASHBOARD_OUTPUT_DIR/test-results-live.json"
export DASHBOARD_OUTPUT_DIR

cd "$PROJECT_DIR"

# Clean previous results
rm -f "$RESULTS_FILE"

# Check if http-server or python is available for serving
HTTP_PID=""
cleanup() {
  if [ -n "$HTTP_PID" ]; then
    kill "$HTTP_PID" 2>/dev/null || true
    wait "$HTTP_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Try to start a simple HTTP server
if command -v npx &>/dev/null; then
  npx --yes http-server "$SCRIPT_DIR" -p "$DASHBOARD_PORT" -c-1 --silent --cors 2>/dev/null &
  HTTP_PID=$!
elif command -v python3 &>/dev/null; then
  (cd "$SCRIPT_DIR" && python3 -m http.server "$DASHBOARD_PORT" --bind 127.0.0.1) 2>/dev/null &
  HTTP_PID=$!
elif command -v python &>/dev/null; then
  (cd "$SCRIPT_DIR" && python -m http.server "$DASHBOARD_PORT" --bind 127.0.0.1) 2>/dev/null &
  HTTP_PID=$!
else
  echo "[WARN] No HTTP server found. Install http-server: npm i -g http-server"
  echo "       You can still open e2e/dashboard.html directly (some browsers block fetch from file://)"
fi

sleep 1

echo ""
echo "  =================================================="
echo "  EMP Cloud E2E Test Dashboard"
echo "  =================================================="
echo ""
echo "  Dashboard:  http://localhost:${DASHBOARD_PORT}/dashboard.html"
if [ -n "${DASHBOARD_PUBLIC_URL:-}" ]; then
echo "  Public URL: ${DASHBOARD_PUBLIC_URL}"
fi
echo "  Results:    ${RESULTS_FILE}"
echo ""
echo "  Keyboard shortcuts (in dashboard):"
echo "    /       Focus search"
echo "    Esc     Clear search"
echo "    e       Expand/collapse all"
echo "    1-4     Filter: All / Passed / Failed / Pending"
echo ""
echo "  =================================================="
echo ""

# Determine what to pass to playwright
EXTRA_ARGS=()
SPEC_FILES=()

for arg in "$@"; do
  if [[ "$arg" == --* ]]; then
    EXTRA_ARGS+=("$arg")
  else
    SPEC_FILES+=("$arg")
  fi
done

# Default: run all e2e specs
if [ ${#SPEC_FILES[@]} -eq 0 ]; then
  SPEC_FILES=("e2e/")
fi

echo "Running: npx playwright test ${SPEC_FILES[*]} --reporter=./e2e/dashboard-reporter.ts,line ${EXTRA_ARGS[*]}"
echo ""

# Run Playwright with the dashboard reporter (plus line reporter for terminal output)
npx playwright test "${SPEC_FILES[@]}" \
  --reporter="./e2e/dashboard-reporter.ts,line" \
  "${EXTRA_ARGS[@]}" || true

echo ""
echo "  Tests complete. Dashboard remains open at http://localhost:${DASHBOARD_PORT}/dashboard.html"
echo "  Press Ctrl+C to stop the server."
echo ""

# Keep server running so user can review results
if [ -n "$HTTP_PID" ]; then
  wait "$HTTP_PID"
fi
