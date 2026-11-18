# Ejecutor en memoria del motor nativo C# (Remoto_1) usando el proceso firmado de Microsoft PowerShell
# Evita el bloqueo de archivos .exe personalizados y de políticas de ejecución .ps1.

$ErrorActionPreference = 'Stop'
$WarningPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

$directorioBase = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$rutaCs = Join-Path $directorioBase 'motor_nativo.cs'

if (-not (Test-Path $rutaCs)) {
    [Console]::Error.WriteLine("[ERROR] No se encontro motor_nativo.cs en $directorioBase")
    exit 1
}

$codigoCs = [System.IO.File]::ReadAllText($rutaCs, [System.Text.Encoding]::UTF8)

Add-Type -TypeDefinition $codigoCs -ReferencedAssemblies @(
    'System.Drawing',
    'System.Windows.Forms'
) -IgnoreWarnings *>$null

[Remoto1.MotorNativo]::Main(@())
