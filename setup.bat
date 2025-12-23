@echo off
echo Installing dependencies...
call npm install
call npm install -g webtorrent-cli

where mpv >nul 2>nul
if %errorlevel% neq 0 (
    echo MPV not found. Please install it from https://mpv.io/installation/
    pause
    exit /b 1
)

echo Setup complete! Run 'npm start' to launch the app.
pause
