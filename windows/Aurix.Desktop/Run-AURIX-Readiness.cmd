@echo off
setlocal
title AURIX Windows Readiness Check
echo.
echo AURIX Windows Readiness Check
echo This native check is read-only. It does not open the microphone or record audio.
echo.
if not exist "%~dp0Aurix.Desktop.exe" (
  echo ERROR: Aurix.Desktop.exe is missing.
  echo Please re-extract the complete AURIX-Windows-x64 ZIP.
  echo.
  pause
  exit /b 1
)
"%~dp0Aurix.Desktop.exe" --readiness-check
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo The check could not complete. No Windows security settings were changed.
  pause
)
exit /b %RESULT%
