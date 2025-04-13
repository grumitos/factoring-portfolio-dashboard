@echo off
echo Ejecutando script de conversión de XLSX a JSON...

:: Asegura que el script se ejecute en el directorio del .bat
cd /d "%~dp0"

:: Ejecuta el script de Python (CORREGIDO EL NOMBRE)
python script.py

echo.
echo Proceso finalizado.
pause