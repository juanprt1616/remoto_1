@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Remoto_1 - Iniciador Portable de Escritorio Remoto
echo ===========================================================
echo   REMOTO_1 - INICIADOR PORTABLE AUTOMATICO (WINDOWS 10/11)
echo ===========================================================

:: 1. Verificar o compilar el motor nativo de Windows (C#)
if not exist "motor_nativo.exe" (
    echo [1/4] Compilando motor nativo de Windows ^(motor_nativo.exe^)...
    if exist "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
        "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:exe /out:motor_nativo.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll motor_nativo.cs
    ) else (
        csc /nologo /optimize+ /target:exe /out:motor_nativo.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll motor_nativo.cs
    )
    if exist "motor_nativo.exe" (
        echo       [OK] motor_nativo.exe listo.
    ) else (
        echo       [ERROR] No se pudo compilar motor_nativo.cs.
        pause
        exit /b 1
    )
) else (
    echo [1/4] Motor nativo ^(motor_nativo.exe^) verificado.
)

:: 2. Verificar si Node.js esta instalado o descargar node.exe portable automaticamente
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
    echo       Descargando Node.js Portable oficial ^(node.exe^) automaticamente...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
        "$ProgressPreference = 'SilentlyContinue'; " ^
        "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.11.0/win-x64/node.exe' -OutFile '%~dp0node.exe'"
    if exist "%~dp0node.exe" (
        set "COMANDO_NODE=%~dp0node.exe"
        echo       [OK] Node.js portable descargado exitosamente en la carpeta.
    ) else (
        echo       Intentando instalacion por Winget...
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        set "COMANDO_NODE=node"
    )
)

:: 3. Abrir puerto 8080 en el Firewall de Windows (si tiene permisos)
echo [3/4] Verificando regla de Firewall para el puerto TCP 8080...
netsh advfirewall firewall show rule name="Remoto_1_Agente" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="Remoto_1_Agente" dir=in action=allow protocol=TCP localport=8080 >nul 2>&1
)

:: 4. Abrir navegador local tras 2 segundos y arrancar el servidor
echo [4/4] Iniciando servidor y abriendo interfaz en el navegador...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080"
"%COMANDO_NODE%" servidor.js
pause
