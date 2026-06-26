@echo off
echo ==========================================
echo Starting ClarityStack Microservices in Tabs...
echo ==========================================

:: Strip trailing backslash from %~dp0 to prevent wt from escaping the closing quote
set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"

:: Shared Python virtual environment (at d:\clarity stack\envs\clarity_env)
set "ENV_PYTHON=d:\clarity stack\envs\clarity_env\Scripts\python.exe"

:: NOTE: Before starting, fill in your API keys in each service's .env file!
:: Required keys: GROQ_API_KEY, NVIDIA_API_KEY, MONGO_URI (for Satellite)

:: Use Windows Terminal (wt) to open all services in one window
wt -w 0 ^
  nt --title "1. Backend" -d "%ROOT_DIR%\Backend" cmd /k "title 1. Backend && \"%ENV_PYTHON%\" -m uvicorn main:app --reload --port 8000" ; ^
  nt --title "2. SRS" -d "%ROOT_DIR%\SRS_Service" cmd /k "title 2. SRS && \"%ENV_PYTHON%\" -m uvicorn api:app --reload --port 8001" ; ^
  nt --title "3. Threat" -d "%ROOT_DIR%\ThreatLens_Service" cmd /k "title 3. Threat && \"%ENV_PYTHON%\" -m uvicorn app:app --reload --port 8002" ; ^
  nt --title "4. Sat" -d "%ROOT_DIR%\Satellite" cmd /k "title 4. Sat && set PORT=8003 && npm run dev" ; ^
  nt --title "5. Edit" -d "%ROOT_DIR%\Editor_Service" cmd /k "title 5. Edit && set PORT=8004 && npm start" ; ^
  nt --title "6. UI" -d "%ROOT_DIR%\Web\Frontend" cmd /k "title 6. UI && npm run dev -- --port 8006" ; ^
  nt --title "7. UML API" -d "%ROOT_DIR%\UML_Clarity_Service\backend" cmd /k "title 7. UML API && \"%ENV_PYTHON%\" -m uvicorn main:app --reload --port 8005" ; ^
  nt --title "8. UML UI" -d "%ROOT_DIR%\UML_Clarity_Service" cmd /k "title 8. UML UI && npm run dev" ; ^
  nt --title "9. KILL" -d "%ROOT_DIR%" cmd /k "title 9. KILL && kill_services.bat"

echo.
echo ==========================================
echo Tabs have been launched! 
echo Frontend UI is at: http://localhost:8006
echo Backend API is at: http://localhost:8000
echo ==========================================
exit

