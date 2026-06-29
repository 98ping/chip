#!/usr/bin/env bash
# Chip setup for macOS (and Linux).
# Mirrors setup/install.ps1: builds the Canvas connector, then captures your
# credentials. Run from the project root:  bash setup/install.sh

set -euo pipefail

# Resolve project root (this script lives in <root>/setup)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
echo "Chip setup. Project root: $ROOT"

# 1. Check Node and Git
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found."
  echo "Install Node 18+ (https://nodejs.org or 'brew install node') and re-run."
  exit 1
fi
echo "Node found: $(node --version)"
if ! command -v git >/dev/null 2>&1; then
  echo "Git is required but was not found."
  echo "Install it with 'brew install git' or the Xcode Command Line Tools, then re-run."
  exit 1
fi

# 2. Clone + build the Canvas connector into vendor/
VENDOR="$ROOT/vendor"
CANVAS_DIR="$VENDOR/canvas-mcp"
mkdir -p "$VENDOR"
if [ ! -d "$CANVAS_DIR" ]; then
  echo ""
  echo "Cloning canvas-mcp..."
  git clone --depth 1 https://github.com/mbcrosiersamuel/canvas-mcp.git "$CANVAS_DIR"
else
  echo "canvas-mcp already cloned (vendor/canvas-mcp). Skipping clone."
fi

echo ""
echo "Installing canvas-mcp dependencies (npm install)..."
( cd "$CANVAS_DIR" && npm install )
echo "Building canvas-mcp (npm run build)..."
( cd "$CANVAS_DIR" && npm run build )

ENTRY="$CANVAS_DIR/server/index.js"
if [ -f "$ENTRY" ]; then
  echo "Built OK: $ENTRY"
else
  echo "WARNING: expected build output not found at server/index.js."
  echo "Check vendor/canvas-mcp and update the args in .mcp.json if the path differs."
fi

# 3. Capture credentials
echo ""
echo "--- Canvas credentials ---"
echo "Token: Canvas -> Settings -> Approved Integrations -> + New Access Token"
read -r -s -p "Paste your Canvas API token: " TOKEN
echo ""
read -r -p "Your Canvas domain (e.g. canvas.youruniversity.edu, no https://): " DOMAIN
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%/}"

if [ -z "$TOKEN" ] || [ -z "$DOMAIN" ]; then
  echo "Token or domain was empty. Aborting before writing anything."
  exit 1
fi

# 4. Write .env (read by scripts/canvas.mjs)
printf '%s\n' "CANVAS_API_TOKEN=$TOKEN" "CANVAS_DOMAIN=$DOMAIN" > "$ROOT/.env"
echo "Wrote $ROOT/.env (git-ignored)."

# 5. Add exports to the shell profile (read by the Canvas connector via .mcp.json)
case "${SHELL:-}" in
  *zsh)  PROFILE="$HOME/.zshrc" ;;
  *bash) PROFILE="$HOME/.bash_profile" ;;
  *)     PROFILE="$HOME/.profile" ;;
esac
touch "$PROFILE"
if grep -q "# >>> chip canvas creds >>>" "$PROFILE" 2>/dev/null; then
  sed -i.bak '/# >>> chip canvas creds >>>/,/# <<< chip canvas creds <<</d' "$PROFILE"
  rm -f "$PROFILE.bak"
fi
{
  echo "# >>> chip canvas creds >>>"
  echo "export CANVAS_API_TOKEN=\"$TOKEN\""
  echo "export CANVAS_DOMAIN=\"$DOMAIN\""
  echo "# <<< chip canvas creds <<<"
} >> "$PROFILE"
echo "Added CANVAS_API_TOKEN and CANVAS_DOMAIN exports to $PROFILE."

# 6. Quick connectivity check
echo ""
echo "Testing Canvas connection..."
CANVAS_API_TOKEN="$TOKEN" CANVAS_DOMAIN="$DOMAIN" node "$ROOT/scripts/canvas.mjs" courses \
  || echo "Connection test failed. Double-check your token and domain, then try again."

echo ""
echo "Done."
echo "IMPORTANT: open a fresh Terminal (or run: source $PROFILE) so the new variables"
echo "load, then start Claude Code from inside this folder and ask:"
echo '  "What assignments do I still have to do in Canvas?"'
