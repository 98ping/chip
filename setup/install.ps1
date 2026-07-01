# Chip - one-time setup
# Clones & builds the canvas MCP, then captures your Canvas credentials.
# Run from the project root:  powershell -ExecutionPolicy Bypass -File setup/install.ps1

$ErrorActionPreference = "Stop"

# Resolve project root (this script lives in <root>/setup)
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Write-Host "Chip setup - project root: $Root" -ForegroundColor Cyan

# 1. Check Node
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js is required but was not found. Install Node 18+ from https://nodejs.org and re-run." -ForegroundColor Red
    exit 1
}
Write-Host "Node found: $(node --version)"

# 2. Clone + build the canvas MCP into vendor/
$Vendor = Join-Path $Root "vendor"
$CanvasDir = Join-Path $Vendor "canvas-mcp"
if (-not (Test-Path $Vendor)) { New-Item -ItemType Directory -Path $Vendor | Out-Null }

if (-not (Test-Path $CanvasDir)) {
    Write-Host "`nCloning canvas-mcp..." -ForegroundColor Cyan
    git clone --depth 1 https://github.com/mbcrosiersamuel/canvas-mcp.git $CanvasDir
} else {
    Write-Host "`ncanvas-mcp already cloned (vendor/canvas-mcp) - skipping clone." -ForegroundColor DarkGray
}

Write-Host "`nInstalling canvas-mcp dependencies (npm install)..." -ForegroundColor Cyan
Push-Location $CanvasDir
npm install
Write-Host "Building canvas-mcp (npm run build)..." -ForegroundColor Cyan
npm run build
Pop-Location

$Entry = Join-Path $CanvasDir "server\index.js"
if (Test-Path $Entry) {
    Write-Host "Built OK: $Entry" -ForegroundColor Green
} else {
    Write-Host "WARNING: expected build output not found at server\index.js." -ForegroundColor Yellow
    Write-Host "Check vendor\canvas-mcp for the real entry point and update .mcp.json's args accordingly." -ForegroundColor Yellow
}

# 3. Capture credentials
Write-Host "`n--- Canvas credentials ---" -ForegroundColor Cyan
Write-Host "Token: Canvas -> Settings -> Approved Integrations -> + New Access Token"
Write-Host "(input stays visible so you can check the paste; it is only stored locally)" -ForegroundColor DarkGray

# Keystrokes pressed while npm was running would auto-submit the first prompt.
try { $Host.UI.RawUI.FlushInputBuffer() } catch {}

while ($true) {
    $token = (Read-Host "Paste your Canvas API token").Trim().Trim('"').Trim("'")
    if ([string]::IsNullOrWhiteSpace($token)) {
        Write-Host "Nothing was entered. Paste the token (Ctrl+V or right-click) and press Enter." -ForegroundColor Yellow
        continue
    }
    if ($token -notmatch '^\d+~') {
        Write-Host "That doesn't look like a Canvas token (they look like 1234~AbCd...)." -ForegroundColor Yellow
        if ((Read-Host "Use it anyway? (y/N)") -notmatch '^[Yy]') { continue }
    }
    break
}

while ($true) {
    $domain = (Read-Host "Your Canvas domain (e.g. canvas.youruniversity.edu, no https://)").Trim()
    $domain = $domain -replace '^https?://','' -replace '/.*$',''
    if ([string]::IsNullOrWhiteSpace($domain)) {
        Write-Host "Nothing was entered. Type the domain, e.g. youruni.instructure.com." -ForegroundColor Yellow
        continue
    }
    if ($domain -match '~') {
        Write-Host "That looks like an API token, not a domain. Enter just the site address, e.g. youruni.instructure.com." -ForegroundColor Yellow
        continue
    }
    if ($domain -notmatch '\.') {
        Write-Host "That doesn't look like a domain (no dot in it). Try again." -ForegroundColor Yellow
        continue
    }
    break
}

# 4. Write .env (used by scripts/canvas.mjs)
$envPath = Join-Path $Root ".env"
@(
    "CANVAS_API_TOKEN=$token",
    "CANVAS_DOMAIN=$domain"
) | Set-Content -Path $envPath -Encoding utf8
Write-Host "Wrote $envPath (git-ignored)." -ForegroundColor Green

# 5. Set user environment variables (read by the canvas MCP via .mcp.json)
setx CANVAS_API_TOKEN "$token" | Out-Null
setx CANVAS_DOMAIN "$domain" | Out-Null
Write-Host "Set CANVAS_API_TOKEN and CANVAS_DOMAIN as user environment variables." -ForegroundColor Green

# 6. Quick connectivity check
Write-Host "`nTesting Canvas connection..." -ForegroundColor Cyan
$env:CANVAS_API_TOKEN = $token
$env:CANVAS_DOMAIN = $domain
try { node (Join-Path $Root "scripts\canvas.mjs") courses } catch { Write-Host "Connection test failed: $_" -ForegroundColor Yellow }

Write-Host "`nDone." -ForegroundColor Green
Write-Host "IMPORTANT: fully restart Claude Code (and your terminal) so it picks up the" -ForegroundColor Yellow
Write-Host "new environment variables and the canvas MCP server. Then, from this folder," -ForegroundColor Yellow
Write-Host 'ask: "What assignments do I still have to do in Canvas?"' -ForegroundColor Yellow
