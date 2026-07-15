@echo off
cd /d "%~dp0"

REM Open Windows Terminal with all services
wt -w 0 ^
  -p "Command Prompt" --title "1. Backend API" -d "Backend" cmd /k "venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000" ; ^
  -p "Command Prompt" --title "2. Frontend UI" -d "Web\Frontend" cmd /k "npm run dev -- --port 8006"

echo.
echo Windows Terminal opened!
echo.
timeout /t 5
