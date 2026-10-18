@echo off
setlocal
title NIKA DOWNLOADER Version Rollback Manager

echo ===================================================
echo     NIKA DOWNLOADER Version Rollback Manager
echo ===================================================
echo.

node scripts\rollback.js %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Rollback encountered an issue. See message above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
pause
