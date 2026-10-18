@echo off
setlocal
title REA-IDM Version Rollback Manager

echo ===================================================
echo     REA-IDM Version Rollback Manager
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
