@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or later, then run this file again.
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 22) { console.error('Node.js 22 or later is required.'); process.exit(1); }"
if errorlevel 1 (
  pause
  exit /b 1
)
if not defined PORT set PORT=4317
echo Open http://127.0.0.1:%PORT% after the server starts.
echo Keep this window open. Press Ctrl+C to stop.
node server.mjs
pause
