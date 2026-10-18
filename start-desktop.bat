@echo off
title NIKA DOWNLOADER Desktop Application
echo Starting NIKA DOWNLOADER High-Performance Download Manager...
cd /d "%~dp0"
if exist "node_modules\.bin\electron.cmd" (
  call "node_modules\.bin\electron.cmd" src/desktop/main.js
) else (
  call npx electron src/desktop/main.js
)
