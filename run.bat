@echo off
rem Genera el tablero con los exportes de data\ y lo abre en el navegador.
cd /d "%~dp0"
python -m dashboard --open
if errorlevel 1 pause
