@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [券来] 未检测到 Node.js，请先安装 Node.js 22 或更高版本。
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [券来] 首次运行，正在安装依赖……
  call npm install --no-audit --no-fund
  if errorlevel 1 pause & exit /b 1
)

echo [券来] 正在准备本地页面……
call npm run build
if errorlevel 1 pause & exit /b 1

echo [券来] 已启动。关闭此窗口会停止本地服务。
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"
call npm start
pause
