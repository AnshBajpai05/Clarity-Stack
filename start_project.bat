@echo off
echo Starting Claritystack Backend and Frontend...

:: Start Backend
echo Starting Backend...
start cmd /k "cd Backend && ..\venv_temp\Scripts\python.exe -m uvicorn main:app --reload --port 8000"

:: Start Frontend
echo Starting Frontend...
start cmd /k "cd Web\Frontend && npm run dev"

:: Start Satellite
echo Starting Satellite Service...
start cmd /k "cd Satellite && npm run dev"

:: Start SRS Service
echo Starting SRS Service...
start cmd /k "cd SRS_Service && ..\..\..\updated_srsclarity\SRS-Clarity\backend\venv_py311\Scripts\python.exe -m uvicorn api:app --reload --port 8002"

:: Start Editor Service
echo Starting Editor Service...
start cmd /k "cd Editor_Service && npm start"

echo All five services are starting up! Check the new console windows.
pause
