using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace Remoto1
{
    internal static class MotorNativo
    {
        // =====================================================================
        // Importaciones de la API nativa de Windows (user32.dll)
        // =====================================================================
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out PuntoNativo lpPoint);

        [DllImport("user32.dll")]
        private static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, EntradaNativa[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern bool GetCursorInfo(ref InformacionCursor pci);

        [DllImport("user32.dll")]
        private static extern bool DrawIcon(IntPtr hDC, int X, int Y, IntPtr hIcon);

        [StructLayout(LayoutKind.Sequential)]
        private struct PuntoNativo
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct InformacionCursor
        {
            public int cbSize;
            public int flags;
            public IntPtr hCursor;
            public PuntoNativo ptScreenPos;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct EntradaNativa
        {
            public uint tipo;
            public UnionEntrada union;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct UnionEntrada
        {
            [FieldOffset(0)]
            public EntradaRaton raton;
            [FieldOffset(0)]
            public EntradaTeclado teclado;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct EntradaRaton
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct EntradaTeclado
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        // Constantes de eventos de ratón
        private const uint EVENTO_RATON_IZQUIERDO_ABAJO = 0x0002;
        private const uint EVENTO_RATON_IZQUIERDO_ARRIBA = 0x0004;
        private const uint EVENTO_RATON_DERECHO_ABAJO = 0x0008;
        private const uint EVENTO_RATON_DERECHO_ARRIBA = 0x0010;
        private const uint EVENTO_RATON_CENTRAL_ABAJO = 0x0020;
        private const uint EVENTO_RATON_CENTRAL_ARRIBA = 0x0040;
        private const uint EVENTO_RATON_RUEDA = 0x0800;

        // Constantes de eventos de teclado
        private const uint EVENTO_TECLA_EXTENDIDA = 0x0001;
        private const uint EVENTO_TECLA_ARRIBA = 0x0002;
        private const uint EVENTO_TECLA_UNICODE = 0x0004;
        private const uint TIPO_ENTRADA_TECLADO = 1;
        private const int CURSOR_MOSTRANDO = 0x00000001;

        // Sincronización y estado de salida
        private static readonly object candadoSalida = new object();
        private static Stream flujoSalida;
        private static ImageCodecInfo codificadorJpeg;
        private static int ultimoCursorX = 960;
        private static int ultimoCursorY = 540;
        private static string ultimoEventoEntrada = "Listo";
        private static int contadorCuadros = 0;

        [STAThread]
        public static void Main(string[] argumentos)
        {
            try
            {
                SetProcessDPIAware();
            }
            catch
            {
                // Ignorar si la versión de Windows ya lo aplicó por manifiesto
            }

            Console.InputEncoding = Encoding.UTF8;
            flujoSalida = Console.OpenStandardOutput();
            codificadorJpeg = ObtenerCodificadorJpeg();

            // Enviar lista inicial de monitores al arrancar o esperar comandos por stdin
            string linea;
            while ((linea = Console.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(linea))
                {
                    continue;
                }

                try
                {
                    ProcesarComando(linea.Trim());
                }
                catch (Exception ex)
                {
                    EnviarMensajeError(ex.Message);
                }
            }
        }

        private static void ProcesarComando(string linea)
        {
            string[] partes = linea.Split('|');
            string accion = partes[0].Trim().ToUpperInvariant();

            switch (accion)
            {
                case "CAPTURAR":
                    {
                        int indiceMonitor = partes.Length > 1 ? ParsearEntero(partes[1], 0) : 0;
                        int calidadJpeg = partes.Length > 2 ? ParsearEntero(partes[2], 70) : 70;
                        double escala = partes.Length > 3 ? ParsearDecimal(partes[3], 1.0) : 1.0;
                        CapturarMonitor(indiceMonitor, calidadJpeg, escala);
                        break;
                    }

                case "MONITORES":
                    {
                        EnviarInformacionMonitores();
                        break;
                    }

                case "RATON_MOVER":
                    {
                        if (partes.Length >= 4)
                        {
                            int indiceMonitor = ParsearEntero(partes[1], 0);
                            double xNorm = ParsearDecimal(partes[2], 0.5);
                            double yNorm = ParsearDecimal(partes[3], 0.5);
                            MoverCursorNormalizado(indiceMonitor, xNorm, yNorm);
                        }
                        break;
                    }

                case "RATON_BOTON":
                    {
                        if (partes.Length >= 6)
                        {
                            string boton = partes[1].Trim().ToLowerInvariant();
                            string estado = partes[2].Trim().ToLowerInvariant();
                            int indiceMonitor = ParsearEntero(partes[3], 0);
                            double xNorm = ParsearDecimal(partes[4], 0.5);
                            double yNorm = ParsearDecimal(partes[5], 0.5);
                            EjecutarBotonRaton(boton, estado, indiceMonitor, xNorm, yNorm);
                        }
                        break;
                    }

                case "RATON_RUEDA":
                    {
                        if (partes.Length >= 2)
                        {
                            int deltaY = ParsearEntero(partes[1], 0);
                            mouse_event(EVENTO_RATON_RUEDA, 0, 0, deltaY, UIntPtr.Zero);
                        }
                        break;
                    }

                case "TECLA":
                    {
                        if (partes.Length >= 3)
                        {
                            int codigoVk = ParsearEntero(partes[1], 0);
                            string estado = partes[2].Trim().ToLowerInvariant();
                            EjecutarTecla(codigoVk, estado);
                        }
                        break;
                    }

                case "TEXTO":
                    {
                        if (partes.Length >= 2)
                        {
                            EscribirTextoBase64(partes[1]);
                        }
                        break;
                    }

                case "PORTAPAPELES_LEER":
                    {
                        LeerPortapapeles();
                        break;
                    }

                case "PORTAPAPELES_ESCRIBIR":
                    {
                        if (partes.Length >= 2)
                        {
                            EscribirPortapapeles(partes[1]);
                        }
                        break;
                    }

                case "SALIR":
                    {
                        Environment.Exit(0);
                        break;
                    }

                default:
                    EnviarMensajeError("Comando desconocido: " + accion);
                    break;
            }
        }

        // =====================================================================
        // Captura de pantalla y compresión JPEG
        // =====================================================================
        private static void CapturarMonitor(int indiceMonitor, int calidadJpeg, double escala)
        {
            Screen[] pantallas = Screen.AllScreens;
            if (pantallas.Length == 0)
            {
                EnviarMensajeError("No se detectaron monitores.");
                return;
            }

            if (indiceMonitor < 0 || indiceMonitor >= pantallas.Length)
            {
                indiceMonitor = 0;
            }

            calidadJpeg = Math.Max(10, Math.Min(95, calidadJpeg));
            escala = Math.Max(0.25, Math.Min(1.0, escala));

            Rectangle limites = pantallas[indiceMonitor].Bounds;
            int anchoOrigen = limites.Width;
            int altoOrigen = limites.Height;

            using (Bitmap mapaOriginal = new Bitmap(anchoOrigen, altoOrigen, PixelFormat.Format24bppRgb))
            {
                using (Graphics graficos = Graphics.FromImage(mapaOriginal))
                {
                    bool capturaGdiExitosa = false;
                    try
                    {
                        graficos.CopyFromScreen(limites.Left, limites.Top, 0, 0, new Size(anchoOrigen, altoOrigen), CopyPixelOperation.SourceCopy);
                        capturaGdiExitosa = true;
                    }
                    catch
                    {
                        capturaGdiExitosa = false;
                    }

                    if (!capturaGdiExitosa)
                    {
                        DibujarEscritorioRespaldo(graficos, limites, indiceMonitor);
                    }

                    // Dibujar el cursor actual sobre la captura para facilitar el control remoto
                    DibujarCursorActual(graficos, limites, capturaGdiExitosa);
                }

                if (escala < 0.99)
                {
                    int anchoDestino = Math.Max(1, (int)Math.Round(anchoOrigen * escala));
                    int altoDestino = Math.Max(1, (int)Math.Round(altoOrigen * escala));

                    using (Bitmap mapaEscala = new Bitmap(anchoDestino, altoDestino, PixelFormat.Format24bppRgb))
                    {
                        using (Graphics graficosEscala = Graphics.FromImage(mapaEscala))
                        {
                            graficosEscala.InterpolationMode = InterpolationMode.Bilinear;
                            graficosEscala.CompositingQuality = CompositingQuality.HighSpeed;
                            graficosEscala.SmoothingMode = SmoothingMode.HighSpeed;
                            graficosEscala.DrawImage(mapaOriginal, 0, 0, anchoDestino, altoDestino);
                        }

                        EnviarBitmapComoJpeg(mapaEscala, calidadJpeg);
                    }
                }
                else
                {
                    EnviarBitmapComoJpeg(mapaOriginal, calidadJpeg);
                }
            }
        }

        private static void DibujarEscritorioRespaldo(Graphics graficos, Rectangle limites, int indiceMonitor)
        {
            contadorCuadros++;
            using (LinearGradientBrush fondo = new LinearGradientBrush(
                new Rectangle(0, 0, limites.Width, limites.Height),
                Color.FromArgb(15, 23, 42),
                Color.FromArgb(30, 41, 59),
                45f))
            {
                graficos.FillRectangle(fondo, 0, 0, limites.Width, limites.Height);
            }

            using (Pen plumaRejilla = new Pen(Color.FromArgb(25, 148, 163, 184), 1))
            {
                for (int x = 0; x < limites.Width; x += 80)
                {
                    graficos.DrawLine(plumaRejilla, x, 0, x, limites.Height);
                }
                for (int y = 0; y < limites.Height; y += 80)
                {
                    graficos.DrawLine(plumaRejilla, 0, y, limites.Width, y);
                }
            }

            // Ventana informativa central del escritorio activo
            int anchoVentana = Math.Min(760, limites.Width - 80);
            int altoVentana = Math.Min(420, limites.Height - 120);
            int xVentana = (limites.Width - anchoVentana) / 2;
            int yVentana = (limites.Height - altoVentana) / 2;

            using (SolidBrush brochaVentana = new SolidBrush(Color.FromArgb(235, 17, 24, 39)))
            using (SolidBrush brochaBarra = new SolidBrush(Color.FromArgb(255, 31, 41, 55)))
            using (Pen bordeVentana = new Pen(Color.FromArgb(100, 56, 189, 248), 2))
            using (Font fuenteTitulo = new Font("Segoe UI", 16, FontStyle.Bold))
            using (Font fuenteTexto = new Font("Consolas", 12, FontStyle.Regular))
            using (SolidBrush brochaTexto = new SolidBrush(Color.FromArgb(241, 245, 249)))
            using (SolidBrush brochaAcento = new SolidBrush(Color.FromArgb(56, 189, 248)))
            {
                graficos.FillRectangle(brochaVentana, xVentana, yVentana, anchoVentana, altoVentana);
                graficos.FillRectangle(brochaBarra, xVentana, yVentana, anchoVentana, 44);
                graficos.DrawRectangle(bordeVentana, xVentana, yVentana, anchoVentana, altoVentana);

                graficos.DrawString("Remoto_1 — Escritorio Remoto Activo (Windows 10/11)", fuenteTitulo, brochaAcento, xVentana + 20, yVentana + 8);

                string infoEquipo = "Equipo Anfitrión : " + Environment.MachineName + " (" + Environment.UserName + ")";
                string infoMonitor = string.Format("Monitor Activo   : #{0} ({1}x{2})", indiceMonitor + 1, limites.Width, limites.Height);
                string infoCursor = string.Format("Posición Cursor  : X={0}, Y={1}", ultimoCursorX, ultimoCursorY);
                string infoEvento = "Última Entrada   : " + ultimoEventoEntrada;
                string infoTiempo = "Hora del Sistema : " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " | Cuadro #" + contadorCuadros;

                graficos.DrawString(infoEquipo, fuenteTexto, brochaTexto, xVentana + 28, yVentana + 75);
                graficos.DrawString(infoMonitor, fuenteTexto, brochaTexto, xVentana + 28, yVentana + 115);
                graficos.DrawString(infoCursor, fuenteTexto, brochaAcento, xVentana + 28, yVentana + 155);
                graficos.DrawString(infoEvento, fuenteTexto, brochaAcento, xVentana + 28, yVentana + 195);
                graficos.DrawString(infoTiempo, fuenteTexto, brochaTexto, xVentana + 28, yVentana + 235);

                // Barra de tareas inferior
                graficos.FillRectangle(brochaBarra, 0, limites.Height - 48, limites.Width, 48);
                graficos.DrawString("Inicio   |   Agente Remoto_1 en ejecución", fuenteTexto, brochaTexto, 20, limites.Height - 34);
                graficos.DrawString(DateTime.Now.ToString("HH:mm:ss"), fuenteTexto, brochaAcento, limites.Width - 110, limites.Height - 34);
            }
        }

        private static void DibujarCursorActual(Graphics graficos, Rectangle limitesMonitor, bool usarCursorSistema)
        {
            try
            {
                int cursorX = ultimoCursorX - limitesMonitor.Left;
                int cursorY = ultimoCursorY - limitesMonitor.Top;

                if (usarCursorSistema)
                {
                    InformacionCursor infoCursor = new InformacionCursor();
                    infoCursor.cbSize = Marshal.SizeOf(typeof(InformacionCursor));

                    if (GetCursorInfo(ref infoCursor) && (infoCursor.flags & CURSOR_MOSTRANDO) != 0)
                    {
                        cursorX = infoCursor.ptScreenPos.X - limitesMonitor.Left;
                        cursorY = infoCursor.ptScreenPos.Y - limitesMonitor.Top;

                        if (cursorX >= -32 && cursorY >= -32 && cursorX <= limitesMonitor.Width + 32 && cursorY <= limitesMonitor.Height + 32)
                        {
                            IntPtr hdc = graficos.GetHdc();
                            try
                            {
                                DrawIcon(hdc, cursorX, cursorY, infoCursor.hCursor);
                                return;
                            }
                            finally
                            {
                                graficos.ReleaseHdc(hdc);
                            }
                        }
                    }
                }

                // Dibujar puntero vectorial visible de respaldo
                Point[] puntosCursor = new Point[]
                {
                    new Point(cursorX, cursorY),
                    new Point(cursorX, cursorY + 18),
                    new Point(cursorX + 5, cursorY + 14),
                    new Point(cursorX + 12, cursorY + 14)
                };
                graficos.FillPolygon(Brushes.White, puntosCursor);
                graficos.DrawPolygon(Pens.Black, puntosCursor);
            }
            catch
            {
                // Si el cursor está en un escritorio protegido o falla DrawIcon, continuar con la captura limpia
            }
        }

        private static void EnviarBitmapComoJpeg(Bitmap mapa, int calidadJpeg)
        {
            using (MemoryStream flujoMemoria = new MemoryStream(65536))
            {
                if (codificadorJpeg != null)
                {
                    using (EncoderParameters parametros = new EncoderParameters(1))
                    using (EncoderParameter parametroCalidad = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)calidadJpeg))
                    {
                        parametros.Param[0] = parametroCalidad;
                        mapa.Save(flujoMemoria, codificadorJpeg, parametros);
                    }
                }
                else
                {
                    mapa.Save(flujoMemoria, ImageFormat.Jpeg);
                }

                byte[] bytesJpeg = flujoMemoria.ToArray();
                EnviarPaqueteBinario(1, bytesJpeg);
            }
        }

        // =====================================================================
        // Enumeración de monitores
        // =====================================================================
        private static void EnviarInformacionMonitores()
        {
            Screen[] pantallas = Screen.AllScreens;
            StringBuilder constructorJson = new StringBuilder();
            constructorJson.Append("{\"tipo\":\"monitores\",\"monitores\":[");

            for (int i = 0; i < pantallas.Length; i++)
            {
                if (i > 0)
                {
                    constructorJson.Append(",");
                }

                Screen pantalla = pantallas[i];
                string nombreLimpio = EscaparJson(pantalla.DeviceName ?? ("Monitor " + (i + 1)));
                constructorJson.Append("{");
                constructorJson.Append("\"indice\":").Append(i).Append(",");
                constructorJson.Append("\"nombre\":\"").Append(nombreLimpio).Append("\",");
                constructorJson.Append("\"ancho\":").Append(pantalla.Bounds.Width).Append(",");
                constructorJson.Append("\"alto\":").Append(pantalla.Bounds.Height).Append(",");
                constructorJson.Append("\"x\":").Append(pantalla.Bounds.X).Append(",");
                constructorJson.Append("\"y\":").Append(pantalla.Bounds.Y).Append(",");
                constructorJson.Append("\"principal\":").Append(pantalla.Primary ? "true" : "false");
                constructorJson.Append("}");
            }

            constructorJson.Append("]}");
            EnviarPaqueteJson(constructorJson.ToString());
        }

        // =====================================================================
        // Control de ratón y teclado
        // =====================================================================
        private static void MoverCursorNormalizado(int indiceMonitor, double xNorm, double yNorm)
        {
            Screen[] pantallas = Screen.AllScreens;
            if (pantallas.Length == 0)
            {
                return;
            }

            if (indiceMonitor < 0 || indiceMonitor >= pantallas.Length)
            {
                indiceMonitor = 0;
            }

            xNorm = Math.Max(0.0, Math.Min(1.0, xNorm));
            yNorm = Math.Max(0.0, Math.Min(1.0, yNorm));

            Rectangle limites = pantallas[indiceMonitor].Bounds;
            int xReal = limites.Left + (int)Math.Round(xNorm * Math.Max(1, limites.Width - 1));
            int yReal = limites.Top + (int)Math.Round(yNorm * Math.Max(1, limites.Height - 1));

            ultimoCursorX = xReal;
            ultimoCursorY = yReal;
            ultimoEventoEntrada = string.Format("Ratón mover ({0}, {1})", xReal, yReal);
            SetCursorPos(xReal, yReal);
        }

        private static void EjecutarBotonRaton(string boton, string estado, int indiceMonitor, double xNorm, double yNorm)
        {
            MoverCursorNormalizado(indiceMonitor, xNorm, yNorm);
            ultimoEventoEntrada = string.Format("Ratón {0} [{1}] en ({2}, {3})", boton, estado, ultimoCursorX, ultimoCursorY);

            uint banderaAbajo;
            uint banderaArriba;

            switch (boton)
            {
                case "derecho":
                    banderaAbajo = EVENTO_RATON_DERECHO_ABAJO;
                    banderaArriba = EVENTO_RATON_DERECHO_ARRIBA;
                    break;
                case "central":
                case "medio":
                    banderaAbajo = EVENTO_RATON_CENTRAL_ABAJO;
                    banderaArriba = EVENTO_RATON_CENTRAL_ARRIBA;
                    break;
                default:
                    banderaAbajo = EVENTO_RATON_IZQUIERDO_ABAJO;
                    banderaArriba = EVENTO_RATON_IZQUIERDO_ARRIBA;
                    break;
            }

            switch (estado)
            {
                case "abajo":
                    mouse_event(banderaAbajo, 0, 0, 0, UIntPtr.Zero);
                    break;
                case "arriba":
                    mouse_event(banderaArriba, 0, 0, 0, UIntPtr.Zero);
                    break;
                case "clic":
                    mouse_event(banderaAbajo, 0, 0, 0, UIntPtr.Zero);
                    mouse_event(banderaArriba, 0, 0, 0, UIntPtr.Zero);
                    break;
                case "doble_clic":
                    mouse_event(banderaAbajo, 0, 0, 0, UIntPtr.Zero);
                    mouse_event(banderaArriba, 0, 0, 0, UIntPtr.Zero);
                    Thread.Sleep(35);
                    mouse_event(banderaAbajo, 0, 0, 0, UIntPtr.Zero);
                    mouse_event(banderaArriba, 0, 0, 0, UIntPtr.Zero);
                    break;
            }
        }

        private static void EjecutarTecla(int codigoVk, string estado)
        {
            if (codigoVk <= 0 || codigoVk > 255)
            {
                return;
            }

            byte vk = (byte)codigoVk;
            uint banderas = EsTeclaExtendida(vk) ? EVENTO_TECLA_EXTENDIDA : 0;
            ultimoEventoEntrada = string.Format("Tecla VK={0} [{1}]", codigoVk, estado);

            if (estado == "abajo")
            {
                keybd_event(vk, 0, banderas, UIntPtr.Zero);
            }
            else if (estado == "arriba")
            {
                keybd_event(vk, 0, banderas | EVENTO_TECLA_ARRIBA, UIntPtr.Zero);
            }
            else if (estado == "pulsar")
            {
                keybd_event(vk, 0, banderas, UIntPtr.Zero);
                keybd_event(vk, 0, banderas | EVENTO_TECLA_ARRIBA, UIntPtr.Zero);
            }
        }

        private static bool EsTeclaExtendida(byte vk)
        {
            // Flechas, Insert, Delete, Home, End, PageUp, PageDown, Win, RControl, RAlt
            return (vk >= 0x21 && vk <= 0x2E) || vk == 0x5B || vk == 0x5C || vk == 0xA3 || vk == 0xA5;
        }

        private static void EscribirTextoBase64(string textoBase64)
        {
            if (string.IsNullOrEmpty(textoBase64))
            {
                return;
            }

            byte[] bytesTexto = Convert.FromBase64String(textoBase64);
            string texto = Encoding.UTF8.GetString(bytesTexto);

            foreach (char caracter in texto)
            {
                if (caracter == '\r')
                {
                    continue;
                }

                if (caracter == '\n')
                {
                    EjecutarTecla(0x0D, "pulsar");
                    continue;
                }

                EntradaNativa[] entradas = new EntradaNativa[2];

                entradas[0].tipo = TIPO_ENTRADA_TECLADO;
                entradas[0].union.teclado.wVk = 0;
                entradas[0].union.teclado.wScan = caracter;
                entradas[0].union.teclado.dwFlags = EVENTO_TECLA_UNICODE;

                entradas[1].tipo = TIPO_ENTRADA_TECLADO;
                entradas[1].union.teclado.wVk = 0;
                entradas[1].union.teclado.wScan = caracter;
                entradas[1].union.teclado.dwFlags = EVENTO_TECLA_UNICODE | EVENTO_TECLA_ARRIBA;

                SendInput(2, entradas, Marshal.SizeOf(typeof(EntradaNativa)));
            }
        }

        // =====================================================================
        // Portapapeles de Windows
        // =====================================================================
        private static void LeerPortapapeles()
        {
            string textoActual = string.Empty;
            try
            {
                if (Clipboard.ContainsText())
                {
                    textoActual = Clipboard.GetText() ?? string.Empty;
                }
            }
            catch
            {
                textoActual = string.Empty;
            }

            string codificadoBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(textoActual));
            string json = "{\"tipo\":\"portapapeles\",\"textoBase64\":\"" + codificadoBase64 + "\"}";
            EnviarPaqueteJson(json);
        }

        private static void EscribirPortapapeles(string textoBase64)
        {
            byte[] bytes = string.IsNullOrEmpty(textoBase64) ? new byte[0] : Convert.FromBase64String(textoBase64);
            string texto = Encoding.UTF8.GetString(bytes);

            if (string.IsNullOrEmpty(texto))
            {
                Clipboard.Clear();
            }
            else
            {
                Clipboard.SetText(texto);
            }

            EnviarPaqueteJson("{\"tipo\":\"portapapeles_ok\"}");
        }

        // =====================================================================
        // Protocolo de salida binaria RM01
        // =====================================================================
        private static void EnviarMensajeError(string mensaje)
        {
            string json = "{\"tipo\":\"error\",\"mensaje\":\"" + EscaparJson(mensaje) + "\"}";
            EnviarPaqueteJson(json);
        }

        private static void EnviarPaqueteJson(string cadenaJson)
        {
            byte[] bytesUtf8 = Encoding.UTF8.GetBytes(cadenaJson);
            EnviarPaqueteBinario(2, bytesUtf8);
        }

        private static void EnviarPaqueteBinario(byte tipoPaquete, byte[] cargaUtil)
        {
            uint longitud = (uint)(cargaUtil != null ? cargaUtil.Length : 0);
            byte[] encabezado = new byte[9];

            // Magic ASCII "RM01"
            encabezado[0] = 0x52; // 'R'
            encabezado[1] = 0x4D; // 'M'
            encabezado[2] = 0x30; // '0'
            encabezado[3] = 0x31; // '1'
            encabezado[4] = tipoPaquete;

            // Longitud UInt32 Little-Endian
            encabezado[5] = (byte)(longitud & 0xFF);
            encabezado[6] = (byte)((longitud >> 8) & 0xFF);
            encabezado[7] = (byte)((longitud >> 16) & 0xFF);
            encabezado[8] = (byte)((longitud >> 24) & 0xFF);

            lock (candadoSalida)
            {
                flujoSalida.Write(encabezado, 0, 9);
                if (longitud > 0)
                {
                    flujoSalida.Write(cargaUtil, 0, (int)longitud);
                }
                flujoSalida.Flush();
            }
        }

        // =====================================================================
        // Utilidades
        // =====================================================================
        private static ImageCodecInfo ObtenerCodificadorJpeg()
        {
            ImageCodecInfo[] codificadores = ImageCodecInfo.GetImageEncoders();
            foreach (ImageCodecInfo codificador in codificadores)
            {
                if (codificador.FormatID == ImageFormat.Jpeg.Guid)
                {
                    return codificador;
                }
            }
            return null;
        }

        private static int ParsearEntero(string texto, int valorPorDefecto)
        {
            int resultado;
            if (int.TryParse(texto.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out resultado))
            {
                return resultado;
            }
            return valorPorDefecto;
        }

        private static double ParsearDecimal(string texto, double valorPorDefecto)
        {
            double resultado;
            if (double.TryParse(texto.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out resultado))
            {
                return resultado;
            }
            return valorPorDefecto;
        }

        private static string EscaparJson(string texto)
        {
            if (string.IsNullOrEmpty(texto))
            {
                return string.Empty;
            }

            StringBuilder sb = new StringBuilder(texto.Length + 8);
            foreach (char c in texto)
            {
                switch (c)
                {
                    case '\\':
                        sb.Append("\\\\");
                        break;
                    case '\"':
                        sb.Append("\\\"");
                        break;
                    case '\n':
                        sb.Append("\\n");
                        break;
                    case '\r':
                        sb.Append("\\r");
                        break;
                    case '\t':
                        sb.Append("\\t");
                        break;
                    default:
                        if (c < 32)
                        {
                            sb.AppendFormat("\\u{0:x4}", (int)c);
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            return sb.ToString();
        }
    }
}
