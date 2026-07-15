@echo off
:: ============================================================
::  ClarityStack — single-command launcher
::  Usage: run_clarity.bat        (from the repo root)
::  Opens every service in one Windows Terminal window.
::  App URL: http://localhost:8006
:: ============================================================

set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"

echo ==========================================
echo  Starting ClarityStack...
echo ==========================================

wt -w 0 ^
  nt --title "1. Backend :8000" -d "%ROOT_DIR%\Backend" cmd /k "title 1. Backend && venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000" ; ^
  nt --title "2. SRS :8001" -d "%ROOT_DIR%\SRS_Service" cmd /k "title 2. SRS && venv\Scripts\python.exe -m uvicorn api:app --reload --port 8001" ; ^
  nt --title "3. Satellite :8003" -d "%ROOT_DIR%\Satellite" cmd /k "title 3. Satellite && set PORT=8003 && npm run dev" ; ^
  nt --title "4. Editor :8004" -d "%ROOT_DIR%\Editor_Service" cmd /k "title 4. Editor && set PORT=8004 && npm start" ; ^
  nt --title "5. UML API :8005" -d "%ROOT_DIR%\UML_Clarity_Service\backend" cmd /k "title 5. UML API && venv\Scripts\python.exe -m uvicorn main:app --reload --port 8005" ; ^
  nt --title "6. Frontend :8006" -d "%ROOT_DIR%\Web\Frontend" cmd /k "title 6. Frontend && npm run dev -- --port 8006" ; ^
  nt --title "7. UML UI :8007" -d "%ROOT_DIR%\UML_Clarity_Service" cmd /k "title 7. UML UI && npm run dev -- --port 8007" ; ^
  nt --title "8. KILL" -d "%ROOT_DIR%" cmd /k "title 8. KILL && echo Run kill_services.bat to stop everything. && echo."

echo.
echo ==========================================
echo  All services launched in Windows Terminal
echo.
echo    App:  http://localhost:8006
echo    API:  http://localhost:8000/docs
echo ==========================================
