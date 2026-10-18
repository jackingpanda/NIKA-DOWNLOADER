@echo off
title REA-IDM CLI Downloader
cd /d "%~dp0"
node src/cli.js %*
