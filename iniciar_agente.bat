@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Remoto_1 - Iniciador Portable en Segundo Plano
echo ===========================================================
echo   REMOTO_1 - INICIADOR PORTABLE EN SEGUNDO PLANO (WIN 10/11)
echo ===========================================================

:: 1. Desbloquear archivos descargados y limpiar .exe o .zip temporales
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
if exist "%~dp0motor_nativo.exe" del /f /q "%~dp0motor_nativo.exe" >nul 2>&1
if exist "%~dp0Remoto_1.zip" del /f /q "%~dp0Remoto_1.zip" >nul 2>&1

:: 2. Verificar si Node.js esta instalado o descargar el binario oficial firmado de Node.js (OpenJS Foundation)
set "COMANDO_NODE="
where node >nul 2>&1
if %errorlevel% equ 0 (
    set "COMANDO_NODE=node"
    echo [1/3] Node.js detectado en el sistema.
) else if exist "%ProgramFiles%\nodejs\node.exe" (
    set "COMANDO_NODE=%ProgramFiles%\nodejs\node.exe"
    echo [1/3] Node.js detectado en Archivos de programa.
) else if exist "%~dp0node.exe" (
    set "COMANDO_NODE=%~dp0node.exe"
    echo [1/3] Node.js portable detectado en la carpeta local.
) else (
    echo [1/3] Node.js no detectado en este equipo.
    echo       Descargando binario oficial firmado de Node.js ^(node.exe^)...
    "%SystemRoot%\System32\curl.exe" -ksL "https://nodejs.org/dist/v22.11.0/win-x64/node.exe" -o "%~dp0node.exe"
    if exist "%~dp0node.exe" (
        set "COMANDO_NODE=%~dp0node.exe"
        echo       [OK] Node.js oficial descargado en la carpeta.
    ) else (
        echo       [ERROR] No se pudo descargar node.exe. Verifica la conexion a Internet.
        pause
        exit /b 1
    )
)

:: 3. Abrir puerto 8080 en Firewall si tiene permisos (opcional, la conexion a Render no lo requiere)
echo [2/3] Verificando configuracion de red...
netsh advfirewall firewall show rule name="Remoto_1_Agente" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="Remoto_1_Agente" dir=in action=allow protocol=TCP localport=8080 >nul 2>&1
)

:: 4. Iniciar agente silencioso en segundo plano (Iconos ocultos) en memoria sin depender de politicas .ps1
echo [3/3] Iniciando Remoto_1 en segundo plano (Iconos ocultos)...
start "" powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Invoke-Expression ([System.IO.File]::ReadAllText('bandeja_sistema.ps1', [System.Text.Encoding]::UTF8))"

:: Esperar 3 segundos para asegurar que el proceso en segundo plano haya arrancado antes de cerrar CMD
ping 127.0.0.1 -n 4 >nul
tasklist /fi "imagename eq node.exe" 2>nul | find /i "node.exe" >nul
if errorlevel 1 (
    start "Remoto_1 - Activo en Nube" /min "%COMANDO_NODE%" "%~dp0servidor.js"
)
echo [OK] Remoto_1 activo y conectado a la nube.
exit /b 0
