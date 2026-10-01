@echo off
cd /d "%~dp0"
set "GSSF_EXTENSION_ID=%~1"
if not defined GSSF_EXTENSION_ID set "GSSF_EXTENSION_ID=knoioccpepbapgnpbmhjmajhaadhndjd"
WordWorker.exe --install %GSSF_EXTENSION_ID%
pause
