@echo off
rem Portafolio de factoring: genera el tablero con los exportes de data\ y lo abre en el navegador.
rem La primera vez crea .env y data\, y se detiene para completarlos.
rem Uso: run.bat [opciones]   p. ej.: run.bat --fx 3.45
setlocal
cd /d "%~dp0"
set "PYTHONUTF8=1"
set "MIN_PYTHON=3.11"
set "EXIT_CODE=0"

rem Con doble clic (cmd /c "...\run.bat") se hace una pausa final si algo falla; si todo sale bien,
rem el tablero se abre en el navegador.
set "DOUBLE_CLICK="
echo %cmdcmdline% | "%SystemRoot%\System32\find.exe" /i "%~nx0" >nul && set "DOUBLE_CLICK=1"

call :find_python || goto :failed
if not exist ".env" (
    call :create_env
    goto :failed
)

%PY_CMD% -m dashboard --open %*
set "EXIT_CODE=%ERRORLEVEL%"
goto :finish

:find_python
rem Deja en PY_CMD un Python %MIN_PYTHON% o superior: primero python y, si no, el lanzador py.
for %%P in ("python" "py -3") do (
    %%~P -c "import sys; sys.exit(sys.version_info < (%MIN_PYTHON:.=, %))" >nul 2>&1 && (
        set "PY_CMD=%%~P"
        exit /b 0
    )
)
echo ERROR: se necesita Python %MIN_PYTHON% o superior en el PATH.
exit /b 1

:create_env
rem Se detiene siempre: el tablero no debe generarse con los valores de ejemplo de .env.
if not exist "data" mkdir "data"
copy /y ".env.example" ".env" >nul || (
    echo ERROR: no se pudo crear .env a partir de .env.example.
    exit /b 1
)
echo Se creo .env: completa tu capital, aporte y meta, copia los exportes del portal en data\
echo y vuelve a ejecutar run.bat.
exit /b 1

:failed
set "EXIT_CODE=1"

:finish
if defined DOUBLE_CLICK if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
