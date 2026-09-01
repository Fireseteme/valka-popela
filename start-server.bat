@echo off
title Valka popela - multiplayer server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js neni nainstalovany. Stahni ho z https://nodejs.org a spust znovu.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Prvni spusteni - instaluji zavislosti...
  call npm install
)
rem stary server, ktery jeste drzi port 8123, ukoncime — jinak by novy
rem spadl na "EADDRINUSE: address already in use"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8123 ^| findstr LISTENING') do (
  tasklist /FI "PID eq %%p" | findstr /i node.exe >nul && (
    echo Ukoncuji stary server ^(PID %%p^)...
    taskkill /F /PID %%p >nul 2>nul
  )
)
echo.
node server\server.js
pause
