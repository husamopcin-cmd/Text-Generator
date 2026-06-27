@echo off
chcp 65001 >nul
title CinoCode Sunucusu
echo ==========================================
echo    CinoCode Web Arayuzu Baslatiliyor...
echo ==========================================
echo.
echo Lutfen bu siyah ekrani KAPATMAYIN! (Ses motoru calisiyor)
echo Tarayiciniz otomatik olarak aciliyor...

:: Ollama'yi baslat (Ag uzerinden erisime acik sekilde)
set OLLAMA_MODELS=C:\OllamaModels
set OLLAMA_HOST=0.0.0.0
set OLLAMA_ORIGINS=*
start /b "" ollama serve

:: Varsayilan tarayicida arayuzu ac
start http://localhost:8000/cinocode_chat.html

:: Arayuzu yayinlayacak lokal sunucuyu arkada calistir
start /b "" "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" -m http.server 8000

:: Ana ses sunucusunu calistir (8001 portunda)
"%LOCALAPPDATA%\Programs\Python\Python312\python.exe" server.py

pause


