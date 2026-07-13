@echo off
setlocal
set "APP=%~dp0casino_sim.py"

where pyw >nul 2>&1
if not errorlevel 1 (
    start "" pyw -3 "%APP%"
    exit /b 0
)

where pythonw >nul 2>&1
if not errorlevel 1 (
    start "" pythonw "%APP%"
    exit /b 0
)

set "BUNDLED_PYTHONW=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\pythonw.exe"
if exist "%BUNDLED_PYTHONW%" (
    start "" "%BUNDLED_PYTHONW%" "%APP%"
    exit /b 0
)

echo Python 3 bulunamadi. Python'u tkinter destegiyle kurup tekrar deneyin.
pause
exit /b 1
