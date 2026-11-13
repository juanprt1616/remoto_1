@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Remoto_1 - Iniciador Portable en Segundo Plano
echo ===========================================================
echo   REMOTO_1 - INICIADOR PORTABLE EN SEGUNDO PLANO (WIN 10/11)
echo ===========================================================

:: 1. Desbloquear archivos descargados si vienen de un .zip de Internet y limpiar .exe antiguos
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
if exist "%~dp0motor_nativo.exe" del /f /q "%~dp0motor_nativo.exe" >nul 2>&1

:: 2. Verificar si Node.js esta instalado o descargar el binario oficial firmado de Node.js (OpenJS Foundation)
set "COMANDO_NODE="
where node >nul 2>&1
if %errorlevel% equ 0 (
    set "COMANDO_NODE=node"
    echo [1/3] Node.js detectado en el sistema.
) else if exist "%~dp0node.exe" (
    set "COMANDO_NODE=%~dp0node.exe"
    echo [1/3] Node.js portable detectado en la carpeta local.
) else (
    echo [1/3] Node.js no detectado en este equipo.
    echo       Descargando binario oficial firmado de Node.js ^(node.exe^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
        "$ProgressPreference = 'SilentlyContinue'; " ^
        "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.11.0/win-x64/node.exe' -OutFile '%~dp0node.exe'; " ^
        "Unblock-File -Path '%~dp0node.exe' -ErrorAction SilentlyContinue"
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

:: 4. Iniciar agente silencioso en segundo plano (Iconos ocultos) usando PowerShell firmado por Microsoft
echo [3/3] Iniciando Remoto_1 en segundo plano (Iconos ocultos)...
start "" powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0bandeja_sistema.ps1"
exit /b 0
