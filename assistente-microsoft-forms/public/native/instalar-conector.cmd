@echo off
cd /d "%~dp0"
WordWorker.exe --install
if errorlevel 1 echo Nao foi possivel instalar. Confira a mensagem acima.
pause
