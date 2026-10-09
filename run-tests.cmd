@echo off
cd /d "%~dp0"
call npm install
if errorlevel 1 exit /b 1
call npx playwright install chromium
if errorlevel 1 exit /b 1
call npx playwright test --project=public --headed
call npx playwright show-report --host 127.0.0.1 --port 0
