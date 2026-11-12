// Generador del ejecutable único autoextraíble e iniciador portable en segundo plano (Remoto_1_Portable.exe)
// Empaqueta todos los archivos del proyecto en un único .exe nativo de Windows 10/11 (/target:winexe)
// que se ejecuta sin ventana negra de consola y permanece únicamente en la bandeja del sistema ("Iconos ocultos").

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const archivosAEmpaquetar = [
  'configuracion.js',
  'servidor.js',
  'motor_nativo.cs',
  'package.json',
  'iniciar_agente.bat',
  'estaticos/index.html',
  'estaticos/estilos.css',
  'estaticos/cliente.js',
  'README.md'
];

function generarCodigoInstaladorCs(mapaArchivosComprimidos) {
  const entradasCs = Object.entries(mapaArchivosComprimidos)
    .map(([rutaRelativa, base64Gzip]) => {
      return `            { "${rutaRelativa.replace(/\\/g, '/')}", "${base64Gzip}" }`;
    })
    .join(',\n');

  return `using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Remoto_1 Agente de Escritorio Remoto")]
[assembly: AssemblyDescription("Agente ligero y portable de control remoto en segundo plano")]
[assembly: AssemblyCompany("Proyecto Universitario Remoto_1")]
[assembly: AssemblyProduct("Remoto_1 Portable")]
[assembly: AssemblyCopyright("Copyright (c) 2026 Remoto_1")]
[assembly: AssemblyVersion("1.0.2.0")]
[assembly: AssemblyFileVersion("1.0.2.0")]

namespace Remoto1Portable
{
    internal static class IniciadorPortable
    {
        private static readonly Dictionary<string, string> ArchivosEmpaquetados = new Dictionary<string, string>
        {
${entradasCs}
        };

        private static Process procesoServidor;
        private static NotifyIcon iconoBandeja;
        private static bool saliendoIntencionalmente = false;
        private static string rutaNodeGlobal = "";
        private static string directorioDestinoGlobal = "";
        private static Mutex mutexInstancia;

        [STAThread]
        public static int Main(string[] argumentos)
        {
            bool modoSoloPreparar = false;
            foreach (string arg in argumentos)
            {
                if (arg == "--preparar" || arg == "--solo-extraer")
                {
                    modoSoloPreparar = true;
                }
            }

            try
            {
                string directorioEjecutable = AppDomain.CurrentDomain.BaseDirectory;
                directorioDestinoGlobal = DeterminarDirectorioDestino(directorioEjecutable);

                ExtraerArchivosProyecto(directorioDestinoGlobal);
                AsegurarMotorNativoCompilado(directorioDestinoGlobal);
                rutaNodeGlobal = AsegurarNodeDisponible(directorioDestinoGlobal);
                ConfigurarReglaFirewall();

                if (modoSoloPreparar)
                {
                    return 0;
                }

                bool esNuevaInstancia;
                mutexInstancia = new Mutex(true, "Local\\\\Remoto_1_Portable_Agente_Unico", out esNuevaInstancia);
                if (!esNuevaInstancia)
                {
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                IniciarProcesoServidorOculto();
                CrearIconoEnIconosOcultos();

                Application.ApplicationExit += (s, e) => DetenerProcesoServidor();
                Application.Run();

                return 0;
            }
            catch (Exception ex)
            {
                if (!modoSoloPreparar)
                {
                    MessageBox.Show(
                        "Error al iniciar Remoto_1 en segundo plano:\\n" + ex.Message,
                        "Remoto_1",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
                return 1;
            }
        }

        private static void IniciarProcesoServidorOculto()
        {
            DetenerProcesoServidor();

            ProcessStartInfo infoServidor = new ProcessStartInfo
            {
                FileName = rutaNodeGlobal,
                Arguments = "\\"" + Path.Combine(directorioDestinoGlobal, "servidor.js") + "\\"",
                WorkingDirectory = directorioDestinoGlobal,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            procesoServidor = Process.Start(infoServidor);
            if (procesoServidor != null)
            {
                procesoServidor.EnableRaisingEvents = true;
                procesoServidor.Exited += (s, e) =>
                {
                    if (!saliendoIntencionalmente)
                    {
                        Thread.Sleep(2500);
                        if (!saliendoIntencionalmente)
                        {
                            try
                            {
                                IniciarProcesoServidorOculto();
                            }
                            catch
                            {
                                // Ignorar si está cerrando
                            }
                        }
                    }
                };
            }
        }

        private static void DetenerProcesoServidor()
        {
            try
            {
                if (procesoServidor != null && !procesoServidor.HasExited)
                {
                    procesoServidor.Kill();
                    procesoServidor.WaitForExit(1500);
                }
            }
            catch
            {
                // Ignorar si ya finalizó
            }
            procesoServidor = null;
        }

        private static void CrearIconoEnIconosOcultos()
        {
            ContextMenu menuContextual = new ContextMenu();

            MenuItem itemEstado = new MenuItem("Remoto_1 Activo (" + Environment.MachineName + ")");
            itemEstado.Enabled = false;
            menuContextual.MenuItems.Add(itemEstado);

            menuContextual.MenuItems.Add("-");

            MenuItem itemReiniciar = new MenuItem("Reiniciar conexión en segundo plano", (s, e) =>
            {
                IniciarProcesoServidorOculto();
                if (iconoBandeja != null)
                {
                    iconoBandeja.ShowBalloonTip(
                        2000,
                        "Remoto_1",
                        "Conexión reiniciada en segundo plano.",
                        ToolTipIcon.Info
                    );
                }
            });
            menuContextual.MenuItems.Add(itemReiniciar);

            MenuItem itemSalir = new MenuItem("Cerrar Remoto_1 (Apagar acceso)", (s, e) =>
            {
                saliendoIntencionalmente = true;
                if (iconoBandeja != null)
                {
                    iconoBandeja.Visible = false;
                    iconoBandeja.Dispose();
                }
                DetenerProcesoServidor();
                Application.Exit();
                Environment.Exit(0);
            });
            menuContextual.MenuItems.Add(itemSalir);

            iconoBandeja = new NotifyIcon
            {
                Icon = GenerarIconoMonitor(),
                Text = "Remoto_1 — Activo (" + Environment.MachineName + ")",
                ContextMenu = menuContextual,
                Visible = true
            };

            iconoBandeja.ShowBalloonTip(
                2500,
                "Remoto_1 activo en segundo plano",
                "Equipo '" + Environment.MachineName + "' conectado y disponible en Iconos ocultos.",
                ToolTipIcon.Info
            );
        }

        private static Icon GenerarIconoMonitor()
        {
            using (Bitmap bmp = new Bitmap(32, 32))
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);

                using (SolidBrush fondo = new SolidBrush(Color.FromArgb(37, 99, 235)))
                using (Pen borde = new Pen(Color.FromArgb(147, 197, 253), 2f))
                using (SolidBrush puntoVerde = new SolidBrush(Color.FromArgb(16, 185, 129)))
                {
                    g.FillRectangle(fondo, 3, 4, 26, 18);
                    g.DrawRectangle(borde, 3, 4, 26, 18);
                    g.DrawLine(borde, 16, 22, 16, 27);
                    g.DrawLine(borde, 10, 27, 22, 27);
                    g.FillEllipse(puntoVerde, 21, 15, 9, 9);
                }

                return Icon.FromHandle(bmp.GetHicon());
            }
        }

        private static string DeterminarDirectorioDestino(string directorioBase)
        {
            if (File.Exists(Path.Combine(directorioBase, "servidor.js")) &&
                File.Exists(Path.Combine(directorioBase, "motor_nativo.cs")))
            {
                return directorioBase;
            }

            string subcarpeta = Path.Combine(directorioBase, "Remoto_1_Portable");
            if (!Directory.Exists(subcarpeta))
            {
                Directory.CreateDirectory(subcarpeta);
            }
            return subcarpeta;
        }

        private static void ExtraerArchivosProyecto(string directorioDestino)
        {
            foreach (KeyValuePair<string, string> par in ArchivosEmpaquetados)
            {
                string rutaRelativa = par.Key.Replace('/', Path.DirectorySeparatorChar);
                string rutaCompleta = Path.Combine(directorioDestino, rutaRelativa);
                string carpetaPadre = Path.GetDirectoryName(rutaCompleta);

                if (!string.IsNullOrEmpty(carpetaPadre) && !Directory.Exists(carpetaPadre))
                {
                    Directory.CreateDirectory(carpetaPadre);
                }

                try
                {
                    byte[] bytesComprimidos = Convert.FromBase64String(par.Value);
                    using (MemoryStream entrada = new MemoryStream(bytesComprimidos))
                    using (GZipStream gzip = new GZipStream(entrada, CompressionMode.Decompress))
                    using (FileStream salida = new FileStream(rutaCompleta, FileMode.Create, FileAccess.Write))
                    {
                        gzip.CopyTo(salida);
                    }
                }
                catch
                {
                    // Si algún archivo ya está en uso por otra instancia, conservar el existente
                }
            }
        }

        private static void AsegurarMotorNativoCompilado(string directorioDestino)
        {
            string rutaExe = Path.Combine(directorioDestino, "motor_nativo.exe");
            string rutaCs = Path.Combine(directorioDestino, "motor_nativo.cs");

            if (File.Exists(rutaExe))
            {
                return;
            }

            string[] rutasCsc = new string[]
            {
                @"C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
                @"C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
            };

            foreach (string csc in rutasCsc)
            {
                if (!File.Exists(csc)) continue;

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = csc,
                    Arguments = "/nologo /optimize+ /target:exe /out:\\"" + rutaExe + "\\" /r:System.Windows.Forms.dll /r:System.Drawing.dll \\"" + rutaCs + "\\"",
                    WorkingDirectory = directorioDestino,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (Process proc = Process.Start(psi))
                {
                    if (proc != null)
                    {
                        proc.WaitForExit();
                    }
                }

                if (File.Exists(rutaExe))
                {
                    return;
                }
            }

            throw new Exception("No se pudo compilar motor_nativo.exe con el compilador nativo de Windows.");
        }

        private static string AsegurarNodeDisponible(string directorioDestino)
        {
            string nodeLocal = Path.Combine(directorioDestino, "node.exe");
            if (File.Exists(nodeLocal))
            {
                return nodeLocal;
            }

            string nodeArchivosPrograma = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
            if (File.Exists(nodeArchivosPrograma))
            {
                return nodeArchivosPrograma;
            }

            try
            {
                ProcessStartInfo psiWhere = new ProcessStartInfo
                {
                    FileName = "where.exe",
                    Arguments = "node",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                };
                using (Process proc = Process.Start(psiWhere))
                {
                    if (proc != null)
                    {
                        string salida = proc.StandardOutput.ReadLine();
                        proc.WaitForExit();
                        if (proc.ExitCode == 0 && !string.IsNullOrWhiteSpace(salida) && File.Exists(salida.Trim()))
                        {
                            return salida.Trim();
                        }
                    }
                }
            }
            catch
            {
                // Continuar con descarga automática
            }

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            string urlNodePortable = Environment.Is64BitOperatingSystem
                ? "https://nodejs.org/dist/v22.11.0/win-x64/node.exe"
                : "https://nodejs.org/dist/v22.11.0/win-x86/node.exe";

            string rutaTemporal = nodeLocal + ".descarga";
            using (WebClient clienteWeb = new WebClient())
            {
                clienteWeb.DownloadFile(urlNodePortable, rutaTemporal);
            }

            if (File.Exists(rutaTemporal) && new FileInfo(rutaTemporal).Length > 5000000)
            {
                if (File.Exists(nodeLocal)) File.Delete(nodeLocal);
                File.Move(rutaTemporal, nodeLocal);
                return nodeLocal;
            }

            throw new Exception("No se pudo descargar Node.js portable automáticamente. Verifica tu conexión a Internet.");
        }

        private static void ConfigurarReglaFirewall()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "netsh",
                    Arguments = "advfirewall firewall add rule name=\\"Remoto_1_Agente\\" dir=in action=allow protocol=TCP localport=8080",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using (Process proc = Process.Start(psi))
                {
                    if (proc != null) proc.WaitForExit(3000);
                }
            }
            catch
            {
                // Ignorar si no se ejecuta como administrador
            }
        }
    }
}
`;
}

function construirEjecutablePortable() {
  const mapaComprimido = {};
  const listaFinal = [...archivosAEmpaquetar];
  if (fs.existsSync(path.join(__dirname, 'url_nube.txt'))) {
    listaFinal.push('url_nube.txt');
  }

  for (const archivoRelativo of listaFinal) {
    const rutaAbsoluta = path.join(__dirname, archivoRelativo);
    const contenido = fs.readFileSync(rutaAbsoluta);
    const comprimido = zlib.gzipSync(contenido, { level: 9 });
    mapaComprimido[archivoRelativo] = comprimido.toString('base64');
  }

  const codigoCs = generarCodigoInstaladorCs(mapaComprimido);
  const rutaCs = path.join(__dirname, 'instalador_portable.cs');
  const rutaExe = path.join(__dirname, 'Remoto_1_Portable.exe');

  fs.writeFileSync(rutaCs, codigoCs, 'utf8');
  console.log('[OK] Código fuente generado en instalador_portable.cs');

  const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  execSync(
    `"${csc}" /nologo /optimize+ /target:winexe /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:"${rutaExe}" "${rutaCs}"`,
    { cwd: __dirname, stdio: 'inherit' }
  );

  // Generar paquete estándar Remoto_1.zip con el código fuente limpio (sin .exe precompilados)
  // para que ningún antivirus ni política universitaria bloquee la descarga
  const rutaZipEstaticos = path.join(__dirname, 'estaticos', 'Remoto_1.zip');
  const carpetaTemporalZip = path.join(__dirname, 'temp_zip_remoto1');
  try {
    if (fs.existsSync(carpetaTemporalZip)) {
      fs.rmSync(carpetaTemporalZip, { recursive: true, force: true });
    }
    fs.mkdirSync( path.join(carpetaTemporalZip, 'estaticos'), { recursive: true });
    for (const archivoRelativo of listaFinal) {
      const origen = path.join(__dirname, archivoRelativo);
      const destino = path.join(carpetaTemporalZip, archivoRelativo);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(origen, destino);
    }
    if (fs.existsSync(rutaZipEstaticos)) {
      fs.unlinkSync(rutaZipEstaticos);
    }
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${carpetaTemporalZip}', '${rutaZipEstaticos}')"`,
      { cwd: __dirname, stdio: 'inherit' }
    );
    fs.rmSync(carpetaTemporalZip, { recursive: true, force: true });
    console.log('[OK] Paquete limpio creado en estaticos/Remoto_1.zip');
  } catch (errZip) {
    console.warn('[AVISO] Error al crear Remoto_1.zip:', errZip.message);
  }

  const tamanoKb = (fs.statSync(rutaExe).size / 1024).toFixed(1);
  const rutaCopiaEstaticos = path.join(__dirname, 'estaticos', 'Remoto_1_Portable.exe');
  fs.copyFileSync(rutaExe, rutaCopiaEstaticos);
  console.log(`[OK] Ejecutable silencioso (bandeja del sistema) creado: Remoto_1_Portable.exe (${tamanoKb} KB) y copiado a estaticos/`);
}

construirEjecutablePortable();
