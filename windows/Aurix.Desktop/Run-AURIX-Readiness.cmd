@echo off
setlocal
title AURIX Windows Readiness Check
echo.
echo AURIX Windows Readiness Check
echo This check is read-only. It does not record audio or change settings.
echo.
if not exist "%~dp0diagnostics\Test-AurixReadiness.ps1" (
  echo ERROR: The diagnostics folder is missing.
  echo Please re-extract the complete AURIX-Windows-x64 ZIP.
  echo.
  pause
  exit /b 1
)
powershell.exe -NoProfile -File "%~dp0diagnostics\Test-AurixReadiness.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo The check could not complete. No Windows security settings were changed.
pause
exit /b %RESULT%
