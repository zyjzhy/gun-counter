@echo off
cd /d "%~dp0"
title gun-counter
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
