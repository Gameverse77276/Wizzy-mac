@echo off
title BTCRulesScript

echo ==========================================
echo    BTCRulesScript - Starting...
echo ==========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed!
    echo.
    echo Please install Python from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation!
    echo.
    pause
    exit /b 1
)

echo Python found:
python --version
echo.

REM Install/update dependencies
echo Installing dependencies...
python -m pip install --upgrade pip --quiet
python -m pip install -r requirements.txt --quiet

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies!
    echo Try running: python -m pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo Dependencies installed successfully!
echo.

REM Run the app
echo Starting BTCRulesScript...
echo Opening browser at http://127.0.0.1:5000
echo.
echo Press Ctrl+C to stop the server
echo ==========================================
echo.

python app.py
pause
