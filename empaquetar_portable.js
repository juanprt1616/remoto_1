// Generador del ejecutable único autoextraíble e iniciador portable (Remoto_1_Portable.exe)
// Empaqueta todos los archivos del proyecto en un único .exe nativo de Windows 10/11
// que extrae la carpeta Remoto_1, descarga Node.js portable si no existe, compila el motor y arranca todo con 1 clic.

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
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Threading;

namespace Remoto1Portable
{
    internal static class IniciadorPortable
    {
        private static readonly Dictionary<string, string> ArchivosEmpaquetados = new Dictionary<string, string>
        {
${entradasCs}
        };

        [STAThread]
        public static int Main(string[] argumentos)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.Title = "Remoto_1 — Ejecutador e Instalador Portable";

            bool modoSoloPreparar = false;
            foreach (string arg in argumentos)
            {
                if (arg == "--preparar" || arg == "--solo-extraer")
                {
                    modoSoloPreparar = true;
                }
            }

            Console.WriteLine("===============================================================");
            Console.WriteLine("  REMOTO_1 — EJECUTADOR PORTABLE TODO-EN-UNO (WINDOWS 10/11)");
            Console.WriteLine("===============================================================");

            try
            {
                string directorioEjecutable = AppDomain.CurrentDomain.BaseDirectory;
                string directorioDestino = DeterminarDirectorioDestino(directorioEjecutable);

                Console.WriteLine("[1/4] Verificando y extrayendo archivos de Remoto_1 en:");
                Console.WriteLine("      " + directorioDestino);
                ExtraerArchivosProyecto(directorioDestino);

                Console.WriteLine("[2/4] Verificando motor nativo de captura y control (motor_nativo.exe)...");
                AsegurarMotorNativoCompilado(directorioDestino);

                Console.WriteLine("[3/4] Verificando Node.js en este equipo...");
                string rutaNode = AsegurarNodeDisponible(directorioDestino);
                Console.WriteLine("      [OK] Motor Node.js listo: " + rutaNode);

                Console.WriteLine("[4/4] Configurando regla de acceso en Firewall de Windows (Puerto 8080)...");
                ConfigurarReglaFirewall();

                if (modoSoloPreparar)
                {
                    Console.WriteLine("===============================================================");
                    Console.WriteLine("  [OK] INSTALACIÓN PORTABLE VERIFICADA Y LISTA PARA USAR");
                    Console.WriteLine("===============================================================");
                    return 0;
                }

                Console.WriteLine("===============================================================");
                Console.WriteLine("  Iniciando servidor Remoto_1 y abriendo navegador...");
                Console.WriteLine("  (Cierra esta ventana cuando desees apagar el acceso remoto)");
                Console.WriteLine("===============================================================");

                // Abrir el navegador automáticamente después de 1.8 segundos
                Thread hiloNavegador = new Thread(() =>
                {
                    Thread.Sleep(1800);
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = "http://localhost:8080",
                            UseShellExecute = true
                        });
                    }
                    catch
                    {
                        // Ignorar si no hay navegador predeterminado
                    }
                });
                hiloNavegador.IsBackground = true;
                hiloNavegador.Start();

                ProcessStartInfo infoServidor = new ProcessStartInfo
                {
                    FileName = rutaNode,
                    Arguments = "\\"" + Path.Combine(directorioDestino, "servidor.js") + "\\"",
                    WorkingDirectory = directorioDestino,
                    UseShellExecute = false
                };

                using (Process procesoServidor = Process.Start(infoServidor))
                {
                    if (procesoServidor != null)
                    {
                        procesoServidor.WaitForExit();
                    }
                }

                return 0;
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERROR] " + ex.Message);
                Console.ResetColor();
                if (!modoSoloPreparar)
                {
                    Console.WriteLine("Presiona Enter para salir...");
                    Console.ReadLine();
                }
                return 1;
            }
        }

        private static string DeterminarDirectorioDestino(string directorioBase)
        {
            // Si ya estamos dentro de la carpeta del proyecto (existe servidor.js), usarla directamente
            if (File.Exists(Path.Combine(directorioBase, "servidor.js")) &&
                File.Exists(Path.Combine(directorioBase, "motor_nativo.cs")))
            {
                return directorioBase;
            }

            // Si el .exe se copió suelto en otro PC (ej. Escritorio o Descargas), crear subcarpeta Remoto_1_Portable
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

                // Extraer y actualizar siempre los archivos del sistema
                byte[] bytesComprimidos = Convert.FromBase64String(par.Value);
                using (MemoryStream entrada = new MemoryStream(bytesComprimidos))
                using (GZipStream gzip = new GZipStream(entrada, CompressionMode.Decompress))
                using (FileStream salida = new FileStream(rutaCompleta, FileMode.Create, FileAccess.Write))
                {
                    gzip.CopyTo(salida);
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
            // 1. Verificar si existe node.exe portable en la misma carpeta
            string nodeLocal = Path.Combine(directorioDestino, "node.exe");
            if (File.Exists(nodeLocal))
            {
                return nodeLocal;
            }

            // 2. Verificar ubicación estándar de instalación en Windows
            string nodeArchivosPrograma = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
            if (File.Exists(nodeArchivosPrograma))
            {
                return nodeArchivosPrograma;
            }

            // 3. Verificar en variable PATH del sistema
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

            // 4. Descargar automáticamente el ejecutable oficial portable de Node.js (sin requerir instalador MSI)
            Console.WriteLine("      Node.js no está instalado en este PC.");
            Console.WriteLine("      Descargando automáticamente Node.js Portable oficial (node.exe)...");

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
                Console.WriteLine("      [OK] Node.js Portable descargado e instalado localmente.");
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
    `"${csc}" /nologo /optimize+ /target:exe /out:"${rutaExe}" "${rutaCs}"`,
    { cwd: __dirname, stdio: 'inherit' }
  );

  const tamanoKb = (fs.statSync(rutaExe).size / 1024).toFixed(1);
  const rutaCopiaEstaticos = path.join(__dirname, 'estaticos', 'Remoto_1_Portable.exe');
  fs.copyFileSync(rutaExe, rutaCopiaEstaticos);
  console.log(`[OK] Ejecutable único creado exitosamente: Remoto_1_Portable.exe (${tamanoKb} KB) y copiado a estaticos/`);
}

construirEjecutablePortable();
