@echo off
rem Jalankan scripts\vercel-secrets.sh lewat Git Bash, dari PowerShell atau cmd.
rem Pemakaian:  .\scripts\vercel-secrets.cmd
setlocal
set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not exist "%BASH%" (
  echo Git Bash tidak ditemukan. Instal Git for Windows dari https://git-scm.com/download/win
  exit /b 1
)
"%BASH%" "%~dp0vercel-secrets.sh"
exit /b %ERRORLEVEL%
