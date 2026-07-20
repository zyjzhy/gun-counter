@echo off
cd /d "%~dp0"
echo 正在启动外网隧道...
echo 按 Ctrl+C 停止
node start-tunnel.js
pause
