@echo off
chcp 65001 >nul
setlocal
title CinoCode Sunucusu
echo ==========================================
echo    CinoCode Web Arayuzu Baslatiliyor...
echo ==========================================
echo.
echo Lutfen bu siyah ekrani KAPATMAYIN! (Ses motoru calisiyor)

set "PYTHON_EXE="
set "PYTHON_ARGS="

if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
)

if not defined PYTHON_EXE (
    for /f "delims=" %%I in ('where py.exe 2^>nul') do if not defined PYTHON_EXE (
        set "PYTHON_EXE=%%I"
        set "PYTHON_ARGS=-3"
    )
)

if not defined PYTHON_EXE (
    for /f "delims=" %%I in ('where python.exe 2^>nul') do if not defined PYTHON_EXE set "PYTHON_EXE=%%I"
)

if not defined PYTHON_EXE (
    echo HATA: Python 3 bulunamadi. Python kurulumunu kontrol edin.
    pause
    exit /b 1
)

set "OLLAMA_MODELS=C:\OllamaModels"
set "OLLAMA_HOST=127.0.0.1:11434"
set "OLLAMA_ORIGINS=http://localhost:8000,http://127.0.0.1:8000"

where ollama.exe >nul 2>&1
if errorlevel 1 (
    echo UYARI: Ollama bulunamadi; bulut modelleriyle devam edebilirsiniz.
) else (
    start /b "" ollama serve
)

start /b "" "%PYTHON_EXE%" %PYTHON_ARGS% -m http.server 8000 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" http://localhost:8000/cinocode_chat.html

"%PYTHON_EXE%" %PYTHON_ARGS% server.py

pause
endlocal
