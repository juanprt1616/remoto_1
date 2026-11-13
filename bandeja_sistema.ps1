# Agente en segundo plano e icono en "Iconos ocultos" (Bandeja del sistema) para Remoto_1
# Ejecutado mediante powershell.exe firmado por Microsoft y node.exe firmado por OpenJS Foundation.
# No requiere ningún archivo .exe personalizado ni compilado localmente, evitando bloqueos de Smart App Control y AppLocker.

$ErrorActionPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Ocultar cualquier ventana de consola asociada al proceso actual de PowerShell
$codigoWin32 = @'
using System;
using System.Runtime.InteropServices;
public static class OcultadorConsolaRemoto1 {
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@
try {
    Add-Type -TypeDefinition $codigoWin32 -IgnoreWarnings *>$null
    $manejadorConsola = [OcultadorConsolaRemoto1]::GetConsoleWindow()
    if ($manejadorConsola -ne [IntPtr]::Zero) {
        [OcultadorConsolaRemoto1]::ShowWindow($manejadorConsola, 0) | Out-Null
    }
} catch {}

$directorioBase = $PSScriptRoot
if (-not $directorioBase) {
    $directorioBase = (Get-Location).Path
}

# Eliminar cualquier motor_nativo.exe antiguo para usar siempre el motor en memoria (motor_nativo.ps1)
$rutaExeAntiguo = Join-Path $directorioBase 'motor_nativo.exe'
if (Test-Path $rutaExeAntiguo) {
    Remove-Item -Path $rutaExeAntiguo -Force -ErrorAction SilentlyContinue
}

# Localizar o descargar el binario oficial firmado de Node.js (OpenJS Foundation)
function Obtener-RutaNode {
    $nodeLocal = Join-Path $directorioBase 'node.exe'
    if (Test-Path $nodeLocal) {
        return $nodeLocal
    }
    $nodeSistema = (Get-Command node -ErrorAction SilentlyContinue).Source
    if ($nodeSistema -and (Test-Path $nodeSistema)) {
        return $nodeSistema
    }
    $nodeProgramFiles = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path $nodeProgramFiles) {
        return $nodeProgramFiles
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $urlNode = if ([Environment]::Is64BitOperatingSystem) {
        'https://nodejs.org/dist/v22.11.0/win-x64/node.exe'
    } else {
        'https://nodejs.org/dist/v22.11.0/win-x86/node.exe'
    }
    Invoke-WebRequest -Uri $urlNode -OutFile $nodeLocal
    Unblock-File -Path $nodeLocal -ErrorAction SilentlyContinue
    return $nodeLocal
}

$script:rutaNode = Obtener-RutaNode
$script:rutaServidor = Join-Path $directorioBase 'servidor.js'
$script:procesoServidor = $null
$script:saliendoIntencionalmente = $false

function Detener-InstanciasPreviasServidor {
    try {
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
            $_.CommandLine -match 'servidor\.js'
        } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

function Iniciar-ServidorOculto {
    if ($script:procesoServidor -and -not $script:procesoServidor.HasExited) {
        try {
            $script:procesoServidor.Kill()
            $script:procesoServidor.WaitForExit(1500)
        } catch {}
    }

    $infoInicio = New-Object System.Diagnostics.ProcessStartInfo
    $infoInicio.FileName = $script:rutaNode
    $infoInicio.Arguments = "`"$($script:rutaServidor)`""
    $infoInicio.WorkingDirectory = $directorioBase
    $infoInicio.UseShellExecute = $false
    $infoInicio.CreateNoWindow = $true
    $infoInicio.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

    $script:procesoServidor = [System.Diagnostics.Process]::Start($infoInicio)
}

function Crear-IconoMonitor {
    $bmp = New-Object System.Drawing.Bitmap(32, 32)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $brochaFondo = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(37, 99, 235))
    $lapizBorde = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(147, 197, 253), 2)
    $brochaVerde = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(16, 185, 129))

    $g.FillRectangle($brochaFondo, 3, 4, 26, 18)
    $g.DrawRectangle($lapizBorde, 3, 4, 26, 18)
    $g.DrawLine($lapizBorde, 16, 22, 16, 27)
    $g.DrawLine($lapizBorde, 10, 27, 22, 27)
    $g.FillEllipse($brochaVerde, 21, 15, 9, 9)

    $icono = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $g.Dispose()
    return $icono
}

Detener-InstanciasPreviasServidor
Iniciar-ServidorOculto

[System.Windows.Forms.Application]::EnableVisualStyles()

$menuContextual = New-Object System.Windows.Forms.ContextMenu

$itemEstado = New-Object System.Windows.Forms.MenuItem("Remoto_1 Activo ($env:COMPUTERNAME)")
$itemEstado.Enabled = $false
[void]$menuContextual.MenuItems.Add($itemEstado)
[void]$menuContextual.MenuItems.Add("-")

$itemReiniciar = New-Object System.Windows.Forms.MenuItem("Reiniciar conexion en segundo plano")
$itemReiniciar.Add_Click({
    Iniciar-ServidorOculto
    $iconoBandeja.ShowBalloonTip(2000, "Remoto_1", "Conexion reiniciada en segundo plano.", [System.Windows.Forms.ToolTipIcon]::Info)
})
[void]$menuContextual.MenuItems.Add($itemReiniciar)

$itemSalir = New-Object System.Windows.Forms.MenuItem("Cerrar Remoto_1 (Apagar acceso)")
$itemSalir.Add_Click({
    $script:saliendoIntencionalmente = $true
    $iconoBandeja.Visible = $false
    if ($script:procesoServidor -and -not $script:procesoServidor.HasExited) {
        try { $script:procesoServidor.Kill() } catch {}
    }
    Detener-InstanciasPreviasServidor
    $temporizadorVigilancia.Stop()
    $iconoBandeja.Dispose()
    [System.Windows.Forms.Application]::Exit()
})
[void]$menuContextual.MenuItems.Add($itemSalir)

$iconoBandeja = New-Object System.Windows.Forms.NotifyIcon
$iconoBandeja.Icon = Crear-IconoMonitor
$iconoBandeja.Text = "Remoto_1 - Activo ($env:COMPUTERNAME)"
$iconoBandeja.ContextMenu = $menuContextual
$iconoBandeja.Visible = $true

$iconoBandeja.ShowBalloonTip(
    2500,
    "Remoto_1 activo en segundo plano",
    "Equipo '$env:COMPUTERNAME' conectado en https://remoto-1.onrender.com (Iconos ocultos).",
    [System.Windows.Forms.ToolTipIcon]::Info
)

# Temporizador para reiniciar automáticamente servidor.js si se cierra inesperadamente
$temporizadorVigilancia = New-Object System.Windows.Forms.Timer
$temporizadorVigilancia.Interval = 3000
$temporizadorVigilancia.Add_Tick({
    if (-not $script:saliendoIntencionalmente) {
        if (-not $script:procesoServidor -or $script:procesoServidor.HasExited) {
            Iniciar-ServidorOculto
        }
    }
})
$temporizadorVigilancia.Start()

[System.Windows.Forms.Application]::Run()
