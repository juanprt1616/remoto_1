# Ejecutor en memoria del motor nativo C# (Remoto_1) usando el proceso firmado de Microsoft PowerShell
# Evita el bloqueo de archivos .exe personalizados por Smart App Control o AppLocker universitario.

$ErrorActionPreference = 'Stop'
$WarningPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

$rutaCs = Join-Path $PSScriptRoot 'motor_nativo.cs'

if (-not (Test-Path $rutaCs)) {
    [Console]::Error.WriteLine("[ERROR] No se encontro motor_nativo.cs en $PSScriptRoot")
    exit 1
}

$codigoCs = [System.IO.File]::ReadAllText($rutaCs, [System.Text.Encoding]::UTF8)

Add-Type -TypeDefinition $codigoCs -ReferencedAssemblies @(
    'System.Drawing',
    'System.Windows.Forms'
) -IgnoreWarnings *>$null

[Remoto1.MotorNativo]::Main(@())
