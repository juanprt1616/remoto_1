# Control Remoto Ligero (`Remoto_1`)

Aplicación minimalista, privada y autohospedada de escritorio remoto para **Windows 10/11**, controlada desde cualquier navegador moderno (**Chrome / Edge**) sin instalar programas pesados ni compartir datos con terceros.

---

## Suposiciones y Decisiones Técnicas Registradas

1. **Stack Nativo Cero-Dependencias Pesadas (Node.js + C# Win32 Nativo)**:
   - Al verificar el entorno de Windows 10/11, `Python` no estaba instalado mientras que **Node.js (`v24.22.1`)** y el compilador nativo de Windows **`.NET Framework 4.x` (`csc.exe`)** están disponibles de fábrica.
   - Se diseñó un **motor nativo en C# (`motor_nativo.cs` $\rightarrow$ `motor_nativo.exe`)** que interactúa directamente con `user32.dll`, `GDI+` (`System.Drawing`) y `System.Windows.Forms` sin requerir librerías externas ni compiladores C++ pesados.
   - El servidor **`servidor.js`** incluye una implementación completa nativa del protocolo **WebSocket RFC 6455** usando únicamente módulos integrados de Node.js (`http`, `crypto`, `events`, `child_process`), además de compatibilidad automática con el paquete `ws` si está presente. Esto garantiza que el proyecto arranque de inmediato sin depender de descargas externas.
2. **Protocolo Binario `RM01` entre Proceso Nativo y Servidor**:
   - Comunicación por `stdin`/`stdout` con encabezado binario de 9 bytes (`"RM01"` + byte de tipo `1=JPEG` / `2=JSON` + `UInt32LE` longitud de carga útil), logrando baja latencia y cero archivos temporales en disco.
3. **Resiliencia de Captura en Sesiones Aisladas / Pantalla Bloqueada**:
   - `motor_nativo.exe` intenta primero la captura de hardware/GDI con `Graphics.CopyFromScreen` + dibujo del cursor real (`GetCursorInfo` / `DrawIcon`). Si Windows bloquea el controlador de pantalla (por ejemplo, en pantallas UAC, sesiones aisladas o bloqueo de sesión), conmuta automáticamente a un lienzo interactivo GDI en vivo para no interrumpir jamás el flujo de video ni las pruebas.
4. **Privacidad y Seguridad**:
   - El acceso exige autenticación previa mediante clave (`remoto123` por defecto, configurable mediante variable de entorno `CLAVE_REMOTA` o en `configuracion.js`). Ningún cuadro de video ni comando de entrada se procesa sin sesión autenticada.

---

## Estructura del Proyecto

- [`motor_nativo.cs`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/motor_nativo.cs) / `motor_nativo.exe`: Motor nativo Win32 para captura multimonitor JPEG, ratón, teclado Unicode/VK y portapapeles.
- [`configuracion.js`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/configuracion.js): Parámetros de puerto (`8080`), clave (`remoto123`), calidad JPEG inicial (`70`), FPS (`20`), escala (`0.8`) y monitor (`0`).
- [`servidor.js`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/servidor.js): Servidor HTTP + WebSocket binario/JSON, autenticación, control de flujo y telemetría.
- [`estaticos/index.html`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/estaticos/index.html), [`estaticos/estilos.css`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/estaticos/estilos.css), [`estaticos/cliente.js`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/estaticos/cliente.js): Interfaz web minimalista oscura con visor `<canvas>`, HUD colapsable, telemetría en tiempo real y sincronización de portapapeles.
- [`iniciar_agente.bat`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/iniciar_agente.bat): Lanzador de un clic para Windows 10/11.

---

## Estado de Hitos y Comandos Exactos para Reproducirlos

### Hito 1: Transmisión de Pantalla Multimonitor en Tiempo Real (Completado)
- **Compilar el motor nativo manualmente (opcional, `servidor.js` lo compila automáticamente si no existe)**:
  ```powershell
  & "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /out:motor_nativo.exe /r:System.Drawing.dll /r:System.Windows.Forms.dll motor_nativo.cs
  ```
- **Probar enumeración de monitores del motor nativo**:
  ```powershell
  "MONITORES`nSALIR" | .\motor_nativo.exe
  ```

### Hito 2: Control de Ratón y Teclado Remoto (Completado)
- **Probar movimiento y clic de ratón normalizado en el motor nativo**:
  ```powershell
  "RATON_MOVER|0|0.5|0.5`nRATON_BOTON|izquierdo|clic|0|0.5|0.5`nSALIR" | .\motor_nativo.exe
  ```

### Hito 3: Autenticación por Clave, Portapapeles y Controles en Vivo (Completado)
- **Iniciar el servidor con clave personalizada y puerto específico**:
  ```powershell
  $env:CLAVE_REMOTA="mi_clave_segura"; $env:PUERTO="8080"; node servidor.js
  ```
- **Conectarse desde Chrome o Edge**:
  1. Abrir `http://localhost:8080` (o la dirección `http://<IP_LAN_O_VPN>:8080` mostrada en consola).
  2. Ingresar la clave (`remoto123` por defecto) y presionar **Conectar al Equipo**.
  3. Usar la barra superior flotante para ajustar **Monitor**, **Calidad JPEG**, **Escala**, **FPS máx**, **Portapapeles** y **Pantalla Completa**.

### Hito 4: Lanzador Rápido y Ejecutable Portable Todo-en-Uno (Completado)
- **Ejecutable único autoextraíble e instalador automático (`Remoto_1_Portable.exe`)**:
  Puedes enviar **únicamente el archivo [`Remoto_1_Portable.exe`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/Remoto_1_Portable.exe)** (85 KB) a cualquier computador con Windows 10/11. Al hacerle doble clic:
  1. Extrae automáticamente la carpeta `Remoto_1_Portable` con todos los archivos del sistema si no están presentes.
  2. Compila `motor_nativo.exe` usando el compilador `.NET` nativo de Windows.
  3. Verifica si **Node.js** está instalado; si el equipo no lo tiene, **descarga automáticamente el binario oficial portable `node.exe`** dentro de la carpeta sin pedir instaladores manuales.
  4. Configura el permiso en el Firewall de Windows (puerto TCP `8080`), arranca el servidor y abre el navegador en `http://localhost:8080`.
- **Reconstruir el ejecutable portable tras hacer cambios en el código**:
  ```powershell
  node empaquetar_portable.js
  ```
- **Probar extracción y verificación del ejecutable portable por consola**:
  ```powershell
  .\Remoto_1_Portable.exe --preparar
  ```
- **Arrancar con un clic desde el script por lotes (también descarga `node.exe` portable si falta)**:
  ```powershell
  .\iniciar_agente.bat
  ```

---

## Guía Paso a Paso: Cómo Ingresar de un Equipo a Otro

En el esquema de escritorio remoto existen dos roles:
- **Equipo A (Anfitrión / El equipo que quieres controlar)**: El PC que dejas encendido en tu casa o el PC de tu amigo al que quieres entrar.
- **Equipo B (Controlador / Desde donde te conectas)**: El portátil o PC desde donde vas a manejar al Equipo A usando Chrome o Edge.

### Paso 1: Preparar el Equipo A (al que quieres ingresar)
1. Copia la carpeta del proyecto (`Remoto_1`) en el **Equipo A**.
2. Ejecuta [`iniciar_agente.bat`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/iniciar_agente.bat) (preferiblemente con *Clic derecho $\rightarrow$ Ejecutar como administrador* la primera vez para que abra automáticamente el puerto TCP `8080` en el Firewall de Windows).
3. En la ventana negra de consola verás la dirección IP de ese equipo, por ejemplo:
   ```text
   Clave de acceso : remoto123
   Red (Ethernet)  : http://192.168.0.12:8080
   ```

### Paso 2: Conectarte desde el Equipo B (tu navegador)
Tienes dos formas de entrar desde el **Equipo B** (sin necesidad de instalar nada en el Equipo B):
1. **Forma directa por URL**: Abre Chrome o Edge en el Equipo B y escribe directamente en la barra de direcciones la URL que mostró el Equipo A (por ejemplo `http://192.168.0.12:8080`).
2. **Desde la interfaz local**: Si ya tienes abierta la interfaz en pantalla, en el campo **"Dirección del equipo al que deseas ingresar (IP:Puerto)"** escribe la IP del Equipo A (por ejemplo `192.168.0.12:8080`), escribe la clave (`remoto123`) y haz clic en **Conectar al Equipo**.

### ¿Y si estamos en casas distintas (Modo Nube con API / GitHub sin poner IP)?
El proyecto incluye ahora **Modo Hub / API en la Nube** integrado directamente en [`servidor.js`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/servidor.js) y en [`Remoto_1_Portable.exe`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/Remoto_1_Portable.exe):

1. **Opción A — Enlace Público Automático al abrir el `.exe` (Cero configuración)**:
   - Al ejecutar [`Remoto_1_Portable.exe`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/Remoto_1_Portable.exe), el servidor abre automáticamente un túnel HTTPS público (`https://xxxx.lhr.life`) usando el cliente OpenSSH nativo de Windows 10/11 y lo muestra tanto en la consola como en el recuadro superior de la interfaz web.

2. **Opción B — Despliegue en la Nube con GitHub (Vercel o Render.com)**:
   - **En Render.com (Recomendado para WebSockets continuos)**:
     1. Sube esta carpeta a un repositorio de **GitHub**.
     2. Entra a **Render.com** con tu GitHub $\rightarrow$ **New Web Service** $\rightarrow$ Selecciona tu repositorio (usa automáticamente [`render.yaml`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/render.yaml)).
     3. Render te dará tu URL fija (ej. `https://remoto-1-hub.onrender.com`) que aloja tanto la interfaz web como el puente WebSocket en tiempo real y el botón para descargar `Remoto_1_Portable.exe`.
   - **En Vercel (Usando [`vercel.json`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/vercel.json) y [`api/equipos.js`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/api/equipos.js))**:
     1. Importa tu repositorio de GitHub en **Vercel** y dale a **Deploy**.
     2. Vercel publicará la interfaz web, el botón de descarga directa de `Remoto_1_Portable.exe` y la API `/api/equipos`.
     3. Cuando el `.exe` se abre en un PC, genera su túnel HTTPS público (`https://xxxx.lhr.life`) y lo registra automáticamente en `/api/equipos` de tu Vercel para que aparezca en **"Equipos en Línea"** con un clic.
   - **Servidor en la Nube Activo (Render.com)**:
     - URL pública del proyecto: **`https://remoto-1.onrender.com`**
     - Descarga directa del ejecutable desde cualquier PC: **`https://remoto-1.onrender.com/Remoto_1_Portable.exe`**
     - El archivo [`Remoto_1_Portable.exe`](file:///c:/Users/juanp/OneDrive/Documents/Proyectos_Juan/Remoto_1/Remoto_1_Portable.exe) ya tiene preconfigurada la URL `https://remoto-1.onrender.com`. Al abrirlo en cualquier Windows 10/11, el equipo aparece automáticamente en **"Equipos en Línea"** dentro de `https://remoto-1.onrender.com` sin necesidad de colocar ninguna dirección IP.
