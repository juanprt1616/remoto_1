@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Remoto_1 - Iniciador Portable de Escritorio Remoto
echo ===========================================================
echo   REMOTO_1 - INICIADOR PORTABLE AUTOMATICO (WINDOWS 10/11)
echo ===========================================================

:: 1. Desbloquear archivos descargados si vienen de un .zip de Internet
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1

:: 2. Compilar motor_nativo.cs localmente con el compilador oficial de Microsoft Windows (.NET)
if not exist "motor_nativo.exe" (
    echo [1/4] Compilando motor nativo localmente con Microsoft .NET...
    if exist "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:exe /out:motor_nativo.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll motor_nativo.cs
    ) else (
        csc /nologo /optimize+ /target:exe /out:motor_nativo.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll motor_nativo.cs
    )
    if exist "motor_nativo.exe" (
        echo       [OK] motor_nativo.exe compilado localmente.
    ) else (
        echo       [ERROR] No se pudo compilar motor_nativo.cs.
        pause
        exit /b 1
    )
) else (
    echo [1/4] Motor nativo ^(motor_nativo.exe^) listo.
)

:: 3. Verificar si Node.js esta instalado o descargar el binario oficial firmado de Node.js
set "COMANDO_NODE="
where node >nul 2>&1
if %errorlevel% equ 0 (
    set "COMANDO_NODE=node"
    echo [2/4] Node.js detectado en el sistema.
) else if exist "%~dp0node.exe" (
    set "COMANDO_NODE=%~dp0node.exe"
    echo [2/4] Node.js portable detectado en la carpeta local.
) else (
    echo [2/4] Node.js no detectado en este equipo.
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

:: 4. Abrir puerto 8080 en Firewall si tiene permisos (opcional, la conexion a Render no lo requiere)
echo [3/4] Verificando configuracion de red...
netsh advfirewall firewall show rule name="Remoto_1_Agente" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="Remoto_1_Agente" dir=in action=allow protocol=TCP localport=8080 >nul 2>&1
)

:: 5. Iniciar servidor minimizado en la barra de tareas sin usar wrappers .exe bloqueables
echo [4/4] Iniciando agente conectado a https://remoto-1.onrender.com (minimizado)...
start "Remoto_1 - Activo en Nube" /min "%COMANDO_NODE%" "%~dp0servidor.js"
exit /b 0
