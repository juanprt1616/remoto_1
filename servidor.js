// Servidor central de escritorio remoto en Node.js
// Gestiona HTTP estático, WebSockets (con soporte nativo RFC 6455 si 'ws' no está instalado) y el subproceso motor_nativo.exe

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const configuracion = require('./configuracion');

// Implementación compatible con 'ws' (usa paquete 'ws' si existe, o implementación RFC 6455 nativa completa)
let ServidorWebSocket;
const ESTADO_ABIERTO = 1;

try {
  const moduloWs = require('ws');
  ServidorWebSocket = moduloWs.WebSocketServer || moduloWs.Server;
} catch (errorModulo) {
  // Implementación nativa completa de servidor WebSocket RFC 6455 sin dependencias externas
  const { EventEmitter } = require('events');

  class ClienteWebSocketNativo extends EventEmitter {
    constructor(socket) {
      super();
      this.socket = socket;
      this.readyState = ESTADO_ABIERTO;
      this.bufferRecepcion = Buffer.alloc(0);
      this.fragmentosContinuacion = [];
      this.opcodeFragmentado = 0;

      this.socket.on('data', (fragmento) => this.procesarDatosEntrantes(fragmento));
      this.socket.on('close', () => {
        if (this.readyState !== 3) {
          this.readyState = 3;
          this.emit('close');
        }
      });
      this.socket.on('error', (err) => {
        if (this.listenerCount('error') > 0) {
          this.emit('error', err);
        }
      });
    }

    procesarDatosEntrantes(fragmento) {
      this.bufferRecepcion = Buffer.concat([this.bufferRecepcion, fragmento]);

      while (this.bufferRecepcion.length >= 2) {
        const primerByte = this.bufferRecepcion[0];
        const segundoByte = this.bufferRecepcion[1];
        const codigoOperacion = primerByte & 0x0f;
        const tieneMascara = (segundoByte & 0x80) !== 0;
        let longitudCarga = segundoByte & 0x7f;
        let desplazamiento = 2;

        if (longitudCarga === 126) {
          if (this.bufferRecepcion.length < 4) return;
          longitudCarga = this.bufferRecepcion.readUInt16BE(2);
          desplazamiento = 4;
        } else if (longitudCarga === 127) {
          if (this.bufferRecepcion.length < 10) return;
          const parteAlta = this.bufferRecepcion.readUInt32BE(2);
          const parteBaja = this.bufferRecepcion.readUInt32BE(6);
          longitudCarga = parteAlta * 0x100000000 + parteBaja;
          desplazamiento = 10;
        }

        const longitudMascara = tieneMascara ? 4 : 0;
        if (this.bufferRecepcion.length < desplazamiento + longitudMascara + longitudCarga) {
          return;
        }

        let claveMascara = null;
        if (tieneMascara) {
          claveMascara = this.bufferRecepcion.slice(desplazamiento, desplazamiento + 4);
          desplazamiento += 4;
        }

        const datosCarga = Buffer.from(
          this.bufferRecepcion.slice(desplazamiento, desplazamiento + longitudCarga)
        );
        this.bufferRecepcion = this.bufferRecepcion.slice(desplazamiento + longitudCarga);

        if (tieneMascara && claveMascara) {
          for (let i = 0; i < datosCarga.length; i++) {
            datosCarga[i] ^= claveMascara[i & 3];
          }
        }

        const esFinal = (primerByte & 0x80) !== 0;

        if (codigoOperacion === 0x08) {
          // Trama de cierre
          this.close();
          return;
        } else if (codigoOperacion === 0x09) {
          // Ping -> responder Pong
          this.enviarTrama(datosCarga, 0x0a);
        } else if (codigoOperacion === 0x01 || codigoOperacion === 0x02) {
          if (esFinal) {
            const esBinario = codigoOperacion === 0x02;
            this.emit('message', datosCarga, esBinario);
          } else {
            this.opcodeFragmentado = codigoOperacion;
            this.fragmentosContinuacion = [datosCarga];
          }
        } else if (codigoOperacion === 0x00 && this.fragmentosContinuacion.length > 0) {
          this.fragmentosContinuacion.push(datosCarga);
          if (esFinal) {
            const mensajeCompleto = Buffer.concat(this.fragmentosContinuacion);
            const esBinario = this.opcodeFragmentado === 0x02;
            this.fragmentosContinuacion = [];
            this.opcodeFragmentado = 0;
            this.emit('message', mensajeCompleto, esBinario);
          }
        }
      }
    }

    enviarTrama(datos, codigoOperacion) {
      if (this.readyState !== ESTADO_ABIERTO || !this.socket.writable) return;
      const bufferDatos = Buffer.isBuffer(datos) ? datos : Buffer.from(String(datos), 'utf8');
      const longitud = bufferDatos.length;
      let encabezado;

      if (longitud < 126) {
        encabezado = Buffer.alloc(2);
        encabezado[0] = 0x80 | codigoOperacion;
        encabezado[1] = longitud;
      } else if (longitud < 65536) {
        encabezado = Buffer.alloc(4);
        encabezado[0] = 0x80 | codigoOperacion;
        encabezado[1] = 126;
        encabezado.writeUInt16BE(longitud, 2);
      } else {
        encabezado = Buffer.alloc(10);
        encabezado[0] = 0x80 | codigoOperacion;
        encabezado[1] = 127;
        encabezado.writeUInt32BE(Math.floor(longitud / 0x100000000), 2);
        encabezado.writeUInt32BE(longitud >>> 0, 6);
      }

      try {
        this.socket.write(Buffer.concat([encabezado, bufferDatos]));
      } catch (err) {
        this.emit('error', err);
      }
    }

    send(datos, opciones = {}) {
      const codigoOperacion = opciones && opciones.binary ? 0x02 : 0x01;
      this.enviarTrama(datos, codigoOperacion);
    }

    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      try {
        const tramaCierre = Buffer.from([0x88, 0x00]);
        if (this.socket.writable) {
          this.socket.write(tramaCierre);
        }
        this.socket.end();
      } catch (err) {
        // Ignorar errores al cerrar
      }
      this.emit('close');
    }
  }

  class ServidorWebSocketNativo extends EventEmitter {
    constructor(opciones) {
      super();
      this.clients = new Set();
      if (opciones && opciones.server) {
        opciones.server.on('upgrade', (solicitud, socket) => {
          this.manejarUpgrade(solicitud, socket);
        });
      }
    }

    manejarUpgrade(solicitud, socket) {
      const claveCliente = solicitud.headers['sec-websocket-key'];
      if (!claveCliente) {
        socket.destroy();
        return;
      }

      const guidMagico = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
      const claveAceptacion = crypto
        .createHash('sha1')
        .update(claveCliente + guidMagico)
        .digest('base64');

      const cabecerasRespuesta = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${claveAceptacion}`,
        '\r\n'
      ].join('\r\n');

      socket.setNoDelay(true);
      socket.write(cabecerasRespuesta);

      const cliente = new ClienteWebSocketNativo(socket);
      this.clients.add(cliente);
      cliente.on('close', () => {
        this.clients.delete(cliente);
      });

      this.emit('connection', cliente, solicitud);
    }
  }

  ServidorWebSocket = ServidorWebSocketNativo;
}

// Estado global de configuración y sesión
const estadoConfiguracion = {
  calidad: configuracion.calidadInicial,
  fps: configuracion.fpsInicial,
  escala: configuracion.escalaInicial,
  monitor: configuracion.monitorInicial
};

let listaMonitores = [];
let procesoMotor = null;
let bufferMotor = Buffer.alloc(0);
let capturaEnCurso = false;
let temporizadorCaptura = null;
let momentoUltimaCaptura = 0;

// Contadores de telemetría por segundo
let framesEnviadosSegundo = 0;
let bytesEnviadosSegundo = 0;

// Estado de Hub en la Nube y conexión saliente a API remota
const esWindows = process.platform === 'win32';
const agentesEnNube = new Map(); // idEquipo -> { socket, idEquipo, usuario, monitores, conectadoDesde, controladores: Set }
let socketHaciaNube = null;
let nubeAutenticadaActiva = false;
let conectadoANube = false;
let urlPublicaTunel = '';
let procesoTunel = null;
let contadorSesiones = 1;

function obtenerNombreUsuarioLocal() {
  try {
    return os.userInfo().username || 'Usuario';
  } catch (err) {
    return 'Usuario';
  }
}

function obtenerListaEquiposDisponibles() {
  const equipos = [];
  if (esWindows && procesoMotor) {
    equipos.push({
      idEquipo: configuracion.idEquipo,
      usuario: obtenerNombreUsuarioLocal(),
      esLocal: true,
      monitores: listaMonitores.length || 1,
      conectadoDesde: 'Activo localmente'
    });
  }
  for (const [id, info] of agentesEnNube.entries()) {
    if ((info.socket && info.socket.readyState === ESTADO_ABIERTO) || info.urlTunel) {
      equipos.push({
        idEquipo: id,
        usuario: info.usuario || 'Remoto',
        urlTunel: info.urlTunel || '',
        esLocal: false,
        monitores: Array.isArray(info.monitores) ? info.monitores.length : 1,
        conectadoDesde: info.conectadoDesde
      });
    }
  }
  return equipos;
}

function difundirListaEquiposATodos() {
  const mensaje = JSON.stringify({
    tipo: 'lista_equipos',
    equipos: obtenerListaEquiposDisponibles()
  });
  for (const cliente of servidorWs.clients) {
    if (!cliente.esAgenteRemoto && cliente.readyState === ESTADO_ABIERTO) {
      cliente.send(mensaje);
    }
  }
}

// Tipos MIME para servidor HTTP de archivos estáticos
const tiposMime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.exe': 'application/octet-stream'
};

const directorioEstaticos = path.join(__dirname, 'estaticos');

// Obtener lista de direcciones IPv4 de red local / VPN del equipo anfitrión
function obtenerDireccionesRed(puerto) {
  const interfaces = os.networkInterfaces();
  const resultado = [];
  for (const [nombreInterfaz, direcciones] of Object.entries(interfaces)) {
    if (!direcciones) continue;
    for (const dir of direcciones) {
      if (dir.family === 'IPv4' && !dir.internal) {
        resultado.push({
          interfaz: nombreInterfaz,
          ip: dir.address,
          url: `http://${dir.address}:${puerto}`,
          anfitrion: `${dir.address}:${puerto}`
        });
      }
    }
  }
  return resultado;
}

// Servidor HTTP para servir la interfaz web del controlador y la API de Equipos en la Nube
const servidorHttp = http.createServer((solicitud, respuesta) => {
  try {
    const urlLimpia = (solicitud.url || '/').split('?')[0];

    // Preflight CORS para permitir uso desde GitHub Pages / flywireweb u otros dominios
    if (solicitud.method === 'OPTIONS') {
      respuesta.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      respuesta.end();
      return;
    }

    if (urlLimpia === '/info-red') {
      const info = {
        equipo: configuracion.idEquipo,
        usuario: obtenerNombreUsuarioLocal(),
        puerto: configuracion.puerto,
        urlNube: configuracion.urlNube || '',
        conectadoANube,
        urlPublica: urlPublicaTunel || '',
        direcciones: obtenerDireccionesRed(configuracion.puerto),
        equipos: obtenerListaEquiposDisponibles()
      };
      respuesta.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      respuesta.end(JSON.stringify(info));
      return;
    }

    if (urlLimpia === '/api/equipos' && solicitud.method === 'POST') {
      let cuerpo = '';
      solicitud.on('data', (trozo) => {
        cuerpo += trozo.toString('utf8');
      });
      solicitud.on('end', () => {
        try {
          const datos = JSON.parse(cuerpo || '{}');
          const idLimpio = String(datos.idEquipo || '').trim();
          if (idLimpio && !agentesEnNube.has(idLimpio)) {
            agentesEnNube.set(idLimpio, {
              socket: null,
              idEquipo: idLimpio,
              usuario: String(datos.usuario || 'Windows'),
              urlTunel: String(datos.urlTunel || ''),
              monitores: [],
              conectadoDesde: new Date().toLocaleTimeString(),
              controladores: new Set()
            });
          } else if (idLimpio && agentesEnNube.has(idLimpio)) {
            const actual = agentesEnNube.get(idLimpio);
            if (datos.urlTunel) actual.urlTunel = String(datos.urlTunel);
          }
          respuesta.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          respuesta.end(JSON.stringify({ exito: true, equipos: obtenerListaEquiposDisponibles() }));
        } catch (err) {
          respuesta.writeHead(400, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          respuesta.end(JSON.stringify({ exito: false }));
        }
      });
      return;
    }

    if (urlLimpia === '/api/equipos') {
      respuesta.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      respuesta.end(JSON.stringify({ equipos: obtenerListaEquiposDisponibles() }));
      return;
    }

    if (urlLimpia === '/Remoto_1_Portable.exe') {
      const rutaExePortable = path.join(__dirname, 'Remoto_1_Portable.exe');
      if (fs.existsSync(rutaExePortable)) {
        respuesta.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="Remoto_1_Portable.exe"'
        });
        fs.createReadStream(rutaExePortable).pipe(respuesta);
        return;
      }
    }

    if (urlLimpia === '/api/configurar-nube' && solicitud.method === 'POST') {
      let cuerpo = '';
      solicitud.on('data', (trozo) => {
        cuerpo += trozo.toString('utf8');
      });
      solicitud.on('end', () => {
        try {
          const datos = JSON.parse(cuerpo || '{}');
          if (typeof datos.idEquipo === 'string' && datos.idEquipo.trim()) {
            configuracion.idEquipo = datos.idEquipo.trim();
          }
          if (typeof datos.urlNube === 'string') {
            configuracion.urlNube = datos.urlNube.trim();
            fs.writeFileSync(path.join(__dirname, 'url_nube.txt'), configuracion.urlNube, 'utf8');
            iniciarConexionHaciaApiNube();
          }
          respuesta.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          respuesta.end(JSON.stringify({
            exito: true,
            idEquipo: configuracion.idEquipo,
            urlNube: configuracion.urlNube
          }));
        } catch (err) {
          respuesta.writeHead(400, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          respuesta.end(JSON.stringify({ exito: false, mensaje: err.message }));
        }
      });
      return;
    }

    const rutaRelativa = urlLimpia === '/' ? 'index.html' : urlLimpia.replace(/^\/+/, '');
    const rutaArchivo = path.normalize(path.join(directorioEstaticos, rutaRelativa));

    // Prevenir salto de directorio fuera de estaticos/
    if (!rutaArchivo.startsWith(directorioEstaticos)) {
      respuesta.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      respuesta.end('Acceso denegado');
      return;
    }

    fs.readFile(rutaArchivo, (errorLectura, contenido) => {
      if (errorLectura) {
        respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        respuesta.end('Archivo no encontrado');
        return;
      }

      const extension = path.extname(rutaArchivo).toLowerCase();
      const tipoContenido = tiposMime[extension] || 'application/octet-stream';
      respuesta.writeHead(200, {
        'Content-Type': tipoContenido,
        'Cache-Control': 'no-cache'
      });
      respuesta.end(contenido);
    });
  } catch (err) {
    respuesta.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('Error interno del servidor');
  }
});

// Servidor WebSocket acoplado al servidor HTTP
const servidorWs = new ServidorWebSocket({ server: servidorHttp });

function obtenerClientesAutenticadosLocales() {
  const autenticados = [];
  for (const cliente of servidorWs.clients) {
    if (
      cliente.autenticado &&
      !cliente.idEquipoRemoto &&
      cliente.readyState === ESTADO_ABIERTO
    ) {
      autenticados.push(cliente);
    }
  }
  return autenticados;
}

function hayConsumidoresLocalesActivos() {
  return (
    obtenerClientesAutenticadosLocales().length > 0 ||
    (nubeAutenticadaActiva && socketHaciaNube && socketHaciaNube.readyState === 1)
  );
}

function enviarJsonACliente(cliente, objeto) {
  if (cliente && cliente.readyState === ESTADO_ABIERTO) {
    cliente.send(JSON.stringify(objeto));
  }
}

function difundirJsonAutenticados(objeto) {
  const mensajeTexto = JSON.stringify(objeto);
  for (const cliente of obtenerClientesAutenticadosLocales()) {
    cliente.send(mensajeTexto);
  }
  if (nubeAutenticadaActiva && socketHaciaNube && socketHaciaNube.readyState === 1) {
    try {
      socketHaciaNube.send(mensajeTexto);
    } catch (err) {
      // Ignorar error de envío
    }
  }
}

function difundirBinarioAutenticados(bufferBinario) {
  const autenticados = obtenerClientesAutenticadosLocales();
  for (const cliente of autenticados) {
    cliente.send(bufferBinario, { binary: true });
  }
  let enviadoANube = false;
  if (nubeAutenticadaActiva && socketHaciaNube && socketHaciaNube.readyState === 1) {
    try {
      socketHaciaNube.send(bufferBinario);
      enviadoANube = true;
    } catch (err) {
      // Ignorar error de envío
    }
  }
  if (autenticados.length > 0 || enviadoANube) {
    framesEnviadosSegundo += 1;
    bytesEnviadosSegundo += bufferBinario.length;
  }
}

function enviarComandoMotor(lineaComando) {
  if (procesoMotor && procesoMotor.stdin && !procesoMotor.stdin.destroyed && procesoMotor.stdin.writable) {
    try {
      const texto = lineaComando.endsWith('\n') ? lineaComando : `${lineaComando}\n`;
      procesoMotor.stdin.write(texto, 'utf8');
      return true;
    } catch (errorEscritura) {
      console.error('[ERROR] Error al escribir comando al motor nativo:', errorEscritura.message);
    }
  }
  return false;
}

// Bucle de captura de pantalla regulado por demanda y FPS
function programarSiguienteCaptura() {
  if (temporizadorCaptura) {
    clearTimeout(temporizadorCaptura);
    temporizadorCaptura = null;
  }

  if (!hayConsumidoresLocalesActivos()) {
    capturaEnCurso = false;
    return;
  }

  if (!procesoMotor || !procesoMotor.stdin || !procesoMotor.stdin.writable) {
    temporizadorCaptura = setTimeout(programarSiguienteCaptura, 250);
    return;
  }

  if (capturaEnCurso) {
    return;
  }

  const intervaloMs = Math.max(16, Math.round(1000 / estadoConfiguracion.fps));
  const transcurrido = Date.now() - momentoUltimaCaptura;
  const esperaMs = Math.max(0, intervaloMs - transcurrido);

  temporizadorCaptura = setTimeout(() => {
    temporizadorCaptura = null;
    if (!hayConsumidoresLocalesActivos() || capturaEnCurso) return;

    const escalaFormateada = Number(estadoConfiguracion.escala).toFixed(2);
    const comando = `CAPTURAR|${estadoConfiguracion.monitor}|${estadoConfiguracion.calidad}|${escalaFormateada}\n`;
    if (enviarComandoMotor(comando)) {
      capturaEnCurso = true;
      momentoUltimaCaptura = Date.now();
    } else {
      temporizadorCaptura = setTimeout(programarSiguienteCaptura, 200);
    }
  }, esperaMs);
}

// Procesamiento de paquetes recibidos desde stdout de motor_nativo.exe (Protocolo RM01)
function procesarFlujoMotor(fragmento) {
  bufferMotor = Buffer.concat([bufferMotor, fragmento]);

  while (bufferMotor.length >= 9) {
    // Verificar firma mágica "RM01" (0x52, 0x4D, 0x30, 0x31)
    if (
      bufferMotor[0] !== 0x52 ||
      bufferMotor[1] !== 0x4d ||
      bufferMotor[2] !== 0x30 ||
      bufferMotor[3] !== 0x31
    ) {
      // Buscar la siguiente aparición de "RM01" para resincronizar si hubo ruido
      const indiceMagico = bufferMotor.indexOf('RM01', 1, 'ascii');
      if (indiceMagico === -1) {
        bufferMotor = bufferMotor.slice(Math.max(0, bufferMotor.length - 3));
        return;
      }
      bufferMotor = bufferMotor.slice(indiceMagico);
      if (bufferMotor.length < 9) return;
    }

    const tipoPaquete = bufferMotor[4];
    const longitudCarga = bufferMotor.readUInt32LE(5);

    if (bufferMotor.length < 9 + longitudCarga) {
      // Aún faltan bytes para completar este paquete
      return;
    }

    const cargaUtil = bufferMotor.slice(9, 9 + longitudCarga);
    bufferMotor = bufferMotor.slice(9 + longitudCarga);

    if (tipoPaquete === 1) {
      // Paquete Tipo 1: Frame JPEG binario
      capturaEnCurso = false;
      difundirBinarioAutenticados(cargaUtil);
      programarSiguienteCaptura();
    } else if (tipoPaquete === 2) {
      // Paquete Tipo 2: Mensaje JSON UTF-8 desde el motor nativo
      try {
        const textoJson = cargaUtil.toString('utf8');
        const datos = JSON.parse(textoJson);

        if (datos.tipo === 'monitores') {
          listaMonitores = Array.isArray(datos.monitores) ? datos.monitores : [];
          difundirJsonAutenticados({
            tipo: 'monitores',
            monitores: listaMonitores
          });
        } else if (datos.tipo === 'portapapeles') {
          const textoDecodificado = Buffer.from(datos.textoBase64 || '', 'base64').toString('utf8');
          difundirJsonAutenticados({
            tipo: 'portapapeles',
            texto: textoDecodificado
          });
        } else if (datos.tipo === 'error') {
          capturaEnCurso = false;
          programarSiguienteCaptura();
        }
      } catch (errorJson) {
        console.error('[ERROR] Error al parsear JSON del motor nativo:', errorJson.message);
      }
    }
  }
}

// Compilación e inicio del proceso hijo motor_nativo.exe
function compilarMotorSiNecesario(rutaExe, rutaCs) {
  if (fs.existsSync(rutaExe)) return true;
  if (!fs.existsSync(rutaCs)) return false;

  const rutasCompilador = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    'csc.exe'
  ];

  for (const rutaCsc of rutasCompilador) {
    if (rutaCsc !== 'csc.exe' && !fs.existsSync(rutaCsc)) continue;
    try {
      console.log('[INFO] Compilando motor_nativo.cs con', rutaCsc);
      execSync(
        `"${rutaCsc}" /nologo /optimize+ /target:exe /out:"${rutaExe}" /r:System.Windows.Forms.dll /r:System.Drawing.dll "${rutaCs}"`,
        { cwd: __dirname, stdio: 'pipe' }
      );
      if (fs.existsSync(rutaExe)) {
        console.log('[OK] motor_nativo.exe compilado correctamente.');
        return true;
      }
    } catch (errorCompilacion) {
      // Si otro proceso lo está compilando o aún se está escribiendo, reintentaremos luego
    }
  }
  return fs.existsSync(rutaExe);
}

function iniciarMotorNativo() {
  if (!esWindows) {
    console.log('[MODO NUBE] Ejecutando como Hub/API central en la nube (sin motor local de Windows).');
    return;
  }
  const rutaExe = path.join(__dirname, 'motor_nativo.exe');
  const rutaCs = path.join(__dirname, 'motor_nativo.cs');

  if (!compilarMotorSiNecesario(rutaExe, rutaCs)) {
    setTimeout(iniciarMotorNativo, 1500);
    return;
  }

  try {
    procesoMotor = spawn(rutaExe, [], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    bufferMotor = Buffer.alloc(0);
    capturaEnCurso = false;

    console.log(`[OK] Proceso motor_nativo.exe iniciado (PID: ${procesoMotor.pid}).`);

    procesoMotor.stdout.on('data', (fragmento) => {
      procesarFlujoMotor(fragmento);
    });

    procesoMotor.stderr.on('data', (datosError) => {
      const textoError = datosError.toString('utf8').trim();
      if (textoError) {
        console.error('[MOTOR NATIVO]', textoError);
      }
    });

    procesoMotor.on('close', (codigoSalida) => {
      console.warn(`[AVISO] motor_nativo.exe finalizó con código ${codigoSalida}. Reiniciando en 1.5s...`);
      procesoMotor = null;
      capturaEnCurso = false;
      setTimeout(iniciarMotorNativo, 1500);
    });

    procesoMotor.on('error', (errorProceso) => {
      console.error('[ERROR] Fallo en motor_nativo.exe:', errorProceso.message);
    });

    // Solicitar lista inicial de monitores al arrancar el motor
    enviarComandoMotor('MONITORES\n');
    if (hayConsumidoresLocalesActivos()) {
      programarSiguienteCaptura();
    }
  } catch (errorInicio) {
    console.error('[ERROR] No se pudo iniciar motor_nativo.exe:', errorInicio.message);
    setTimeout(iniciarMotorNativo, 2000);
  }
}

// Procesar comando de control sobre el motor nativo local de este PC
function ejecutarComandoControlLocal(comando, responderJson) {
  switch (comando.tipo) {
    case 'configurar': {
      if (comando.calidad !== undefined) {
        const calidadNum = parseInt(comando.calidad, 10);
        if (!Number.isNaN(calidadNum)) {
          estadoConfiguracion.calidad = Math.min(95, Math.max(10, calidadNum));
        }
      }
      if (comando.fps !== undefined) {
        const fpsNum = parseInt(comando.fps, 10);
        if (!Number.isNaN(fpsNum)) {
          estadoConfiguracion.fps = Math.min(60, Math.max(1, fpsNum));
        }
      }
      if (comando.escala !== undefined) {
        const escalaNum = parseFloat(comando.escala);
        if (!Number.isNaN(escalaNum)) {
          estadoConfiguracion.escala = Math.min(1.0, Math.max(0.25, escalaNum));
        }
      }
      if (comando.monitor !== undefined) {
        const monitorNum = parseInt(comando.monitor, 10);
        if (!Number.isNaN(monitorNum) && monitorNum >= 0) {
          estadoConfiguracion.monitor = monitorNum;
        }
      }

      difundirJsonAutenticados({
        tipo: 'configuracion_actualizada',
        configuracion: estadoConfiguracion
      });
      programarSiguienteCaptura();
      break;
    }

    case 'raton_mover': {
      const x = Math.min(1, Math.max(0, Number(comando.x) || 0)).toFixed(4);
      const y = Math.min(1, Math.max(0, Number(comando.y) || 0)).toFixed(4);
      enviarComandoMotor(`RATON_MOVER|${estadoConfiguracion.monitor}|${x}|${y}\n`);
      break;
    }

    case 'raton_boton': {
      const botonRaw = String(comando.boton || 'izquierdo');
      const boton = botonRaw === 'medio' ? 'central' : botonRaw;
      const estado = String(comando.estado || 'abajo');
      const x = Math.min(1, Math.max(0, Number(comando.x) || 0)).toFixed(4);
      const y = Math.min(1, Math.max(0, Number(comando.y) || 0)).toFixed(4);
      enviarComandoMotor(`RATON_BOTON|${boton}|${estado}|${estadoConfiguracion.monitor}|${x}|${y}\n`);
      break;
    }

    case 'raton_rueda': {
      const deltaY = Math.round(Number(comando.deltaY) || 0);
      enviarComandoMotor(`RATON_RUEDA|${deltaY}\n`);
      break;
    }

    case 'tecla': {
      const vk = parseInt(comando.vk, 10);
      const estado = String(comando.estado || 'abajo');
      if (!Number.isNaN(vk) && vk >= 0 && vk <= 255) {
        enviarComandoMotor(`TECLA|${vk}|${estado}\n`);
      }
      break;
    }

    case 'texto': {
      if (typeof comando.texto === 'string' && comando.texto.length > 0) {
        const base64 = Buffer.from(comando.texto, 'utf8').toString('base64');
        enviarComandoMotor(`TEXTO|${base64}\n`);
      }
      break;
    }

    case 'portapapeles_leer': {
      enviarComandoMotor('PORTAPAPELES_LEER\n');
      break;
    }

    case 'portapapeles_escribir': {
      if (typeof comando.texto === 'string') {
        const base64 = Buffer.from(comando.texto, 'utf8').toString('base64');
        enviarComandoMotor(`PORTAPAPELES_ESCRIBIR|${base64}\n`);
      }
      break;
    }

    case 'ping': {
      if (responderJson) {
        responderJson({
          tipo: 'pong',
          marcaTiempo: comando.marcaTiempo
        });
      }
      break;
    }

    default:
      break;
  }
}

// Manejo de conexiones WebSocket (soporta tanto Navegadores Controladores como Agentes Windows Remotos)
servidorWs.on('connection', (cliente) => {
  cliente.idSesion = `ses_${contadorSesiones++}`;
  cliente.autenticado = false;
  cliente.esAgenteRemoto = false;
  cliente.idEquipoAgente = null;
  cliente.idEquipoRemoto = null;

  // Enviar lista de equipos en línea apenas conecta un navegador
  enviarJsonACliente(cliente, {
    tipo: 'lista_equipos',
    equipos: obtenerListaEquiposDisponibles()
  });

  cliente.on('message', (mensajeCrudo, esBinario) => {
    // A) Si el remitente es un Agente Windows remoto registrado en este Hub:
    if (cliente.esAgenteRemoto) {
      const registroAgente = agentesEnNube.get(cliente.idEquipoAgente);
      if (!registroAgente) return;

      if (esBinario) {
        // Reenviar frame JPEG binario a todos los navegadores autenticados con este agente
        for (const controlador of registroAgente.controladores) {
          if (controlador.autenticado && controlador.readyState === ESTADO_ABIERTO) {
            controlador.send(mensajeCrudo, { binary: true });
          }
        }
        return;
      }

      let msgAgente;
      try {
        const txt = Buffer.isBuffer(mensajeCrudo) ? mensajeCrudo.toString('utf8') : String(mensajeCrudo);
        msgAgente = JSON.parse(txt);
      } catch (err) {
        return;
      }

      if (msgAgente.tipo === 'respuesta_autenticacion_nube') {
        for (const controlador of registroAgente.controladores) {
          if (controlador.idSesion === msgAgente.idSesion) {
            if (msgAgente.exito) {
              controlador.autenticado = true;
              enviarJsonACliente(controlador, {
                tipo: 'autenticacion_resultado',
                exito: true,
                configuracion: msgAgente.configuracion,
                monitores: msgAgente.monitores || [],
                monitorActual: msgAgente.monitorActual || 0
              });
              enviarJsonACliente(controlador, {
                tipo: 'autenticado',
                exito: true,
                configuracion: msgAgente.configuracion,
                monitores: msgAgente.monitores || [],
                monitorActual: msgAgente.monitorActual || 0
              });
            } else {
              enviarJsonACliente(controlador, {
                tipo: 'autenticacion_resultado',
                exito: false,
                mensaje: msgAgente.mensaje || 'Clave de acceso incorrecta'
              });
              enviarJsonACliente(controlador, {
                tipo: 'error_autenticacion',
                exito: false,
                mensaje: msgAgente.mensaje || 'Clave de acceso incorrecta'
              });
            }
          }
        }
        return;
      }

      if (msgAgente.tipo === 'monitores' && Array.isArray(msgAgente.monitores)) {
        registroAgente.monitores = msgAgente.monitores;
      }

      // Retransmitir mensajes JSON (monitores, portapapeles, telemetria, pong, etc.) a los controladores de este agente
      const textoReenvio = JSON.stringify(msgAgente);
      for (const controlador of registroAgente.controladores) {
        if (controlador.autenticado && controlador.readyState === ESTADO_ABIERTO) {
          controlador.send(textoReenvio);
        }
      }
      return;
    }

    if (esBinario) return;

    let comando;
    try {
      const texto = Buffer.isBuffer(mensajeCrudo)
        ? mensajeCrudo.toString('utf8')
        : String(mensajeCrudo);
      comando = JSON.parse(texto);
    } catch (errorParseo) {
      return;
    }

    if (!comando || typeof comando.tipo !== 'string') return;

    // 0. Registro de un Agente Windows remoto en este Hub en la Nube
    if (comando.tipo === 'registrar_agente') {
      const idLimpio = String(comando.idEquipo || 'PC-REMOTO').trim();
      cliente.esAgenteRemoto = true;
      cliente.idEquipoAgente = idLimpio;

      const anterior = agentesEnNube.get(idLimpio);
      const controladoresPrevios = anterior ? anterior.controladores : new Set();
      const urlTunelPrevia = anterior && anterior.urlTunel ? anterior.urlTunel : '';

      agentesEnNube.set(idLimpio, {
        socket: cliente,
        idEquipo: idLimpio,
        usuario: String(comando.usuario || 'Windows'),
        urlTunel: urlTunelPrevia,
        monitores: Array.isArray(comando.monitores) ? comando.monitores : [],
        conectadoDesde: new Date().toLocaleTimeString(),
        controladores: controladoresPrevios
      });

      // Si ya había controladores autenticados esperando reconexión, reactivar captura
      for (const ctrl of controladoresPrevios) {
        if (ctrl.autenticado && ctrl.readyState === ESTADO_ABIERTO) {
          enviarJsonACliente(cliente, {
            tipo: 'autenticar_controlador_nube',
            idSesion: ctrl.idSesion,
            clave: configuracion.claveAcceso
          });
          break;
        }
      }

      console.log(`[HUB NUBE] Equipo registrado en línea: ${idLimpio} (${comando.usuario || 'Windows'})`);
      enviarJsonACliente(cliente, { tipo: 'registro_agente_ok', idEquipo: idLimpio });
      difundirListaEquiposATodos();
      return;
    }

    if (comando.tipo === 'listar_equipos') {
      enviarJsonACliente(cliente, {
        tipo: 'lista_equipos',
        equipos: obtenerListaEquiposDisponibles()
      });
      return;
    }

    // 1. Autenticación inicial (hacia un equipo remoto en la nube o hacia este equipo local)
    if (comando.tipo === 'autenticar') {
      const idDestino = comando.idEquipo ? String(comando.idEquipo).trim() : '';

      // Si el usuario seleccionó un equipo remoto registrado en este Hub:
      if (idDestino && agentesEnNube.has(idDestino) && idDestino !== configuracion.idEquipo) {
        const agenteRemoto = agentesEnNube.get(idDestino);
        if (!agenteRemoto || !agenteRemoto.socket || agenteRemoto.socket.readyState !== ESTADO_ABIERTO) {
          enviarJsonACliente(cliente, {
            tipo: 'error_autenticacion',
            exito: false,
            mensaje: `El equipo ${idDestino} ya no está en línea.`
          });
          return;
        }

        cliente.idEquipoRemoto = idDestino;
        agenteRemoto.controladores.add(cliente);
        enviarJsonACliente(agenteRemoto.socket, {
          tipo: 'autenticar_controlador_nube',
          idSesion: cliente.idSesion,
          clave: comando.clave
        });
        return;
      }

      // Si este servidor está en Linux/Nube (sin motor_nativo.exe) y no especificaron un equipo válido
      if (!esWindows && !agentesEnNube.has(idDestino)) {
        const primeroDisponible = agentesEnNube.keys().next().value;
        if (primeroDisponible) {
          const agenteRemoto = agentesEnNube.get(primeroDisponible);
          cliente.idEquipoRemoto = primeroDisponible;
          agenteRemoto.controladores.add(cliente);
          enviarJsonACliente(agenteRemoto.socket, {
            tipo: 'autenticar_controlador_nube',
            idSesion: cliente.idSesion,
            clave: comando.clave
          });
          return;
        }
        enviarJsonACliente(cliente, {
          tipo: 'error_autenticacion',
          exito: false,
          mensaje: 'No hay ningún equipo Windows conectado a la nube en este momento. Abre Remoto_1_Portable.exe en el PC que deseas controlar.'
        });
        return;
      }

      // Autenticación local directa en este equipo Windows
      if (comando.clave === configuracion.claveAcceso) {
        cliente.autenticado = true;
        cliente.idEquipoRemoto = null;
        enviarJsonACliente(cliente, {
          tipo: 'autenticacion_resultado',
          exito: true,
          configuracion: estadoConfiguracion,
          monitores: listaMonitores,
          monitorActual: estadoConfiguracion.monitor
        });
        enviarJsonACliente(cliente, {
          tipo: 'autenticado',
          exito: true,
          configuracion: estadoConfiguracion,
          monitores: listaMonitores,
          monitorActual: estadoConfiguracion.monitor
        });

        if (listaMonitores.length > 0) {
          enviarJsonACliente(cliente, {
            tipo: 'monitores',
            monitores: listaMonitores
          });
        }
        enviarComandoMotor('MONITORES\n');
        programarSiguienteCaptura();
      } else {
        enviarJsonACliente(cliente, {
          tipo: 'autenticacion_resultado',
          exito: false,
          mensaje: 'Clave de acceso incorrecta'
        });
        enviarJsonACliente(cliente, {
          tipo: 'error_autenticacion',
          exito: false,
          mensaje: 'Clave de acceso incorrecta'
        });
      }
      return;
    }

    // Bloquear cualquier otro comando si el cliente no está autenticado
    if (!cliente.autenticado) {
      enviarJsonACliente(cliente, {
        tipo: 'autenticacion_resultado',
        exito: false,
        mensaje: 'Sesión no autenticada'
      });
      enviarJsonACliente(cliente, {
        tipo: 'error_autenticacion',
        exito: false,
        mensaje: 'Sesión no autenticada'
      });
      return;
    }

    // Si el cliente está controlando un equipo remoto a través de este Hub en la nube:
    if (cliente.idEquipoRemoto) {
      const agenteRemoto = agentesEnNube.get(cliente.idEquipoRemoto);
      if (agenteRemoto && agenteRemoto.socket && agenteRemoto.socket.readyState === ESTADO_ABIERTO) {
        if (comando.tipo === 'ping') {
          enviarJsonACliente(cliente, {
            tipo: 'pong',
            marcaTiempo: comando.marcaTiempo
          });
        } else {
          enviarJsonACliente(agenteRemoto.socket, comando);
        }
      }
      return;
    }

    // 2. Comandos de control local
    ejecutarComandoControlLocal(comando, (respuestaObj) => enviarJsonACliente(cliente, respuestaObj));
  });

  cliente.on('close', () => {
    if (cliente.esAgenteRemoto && cliente.idEquipoAgente) {
      const reg = agentesEnNube.get(cliente.idEquipoAgente);
      if (reg && reg.socket === cliente) {
        agentesEnNube.delete(cliente.idEquipoAgente);
        console.log(`[HUB NUBE] Equipo desconectado: ${cliente.idEquipoAgente}`);
        difundirListaEquiposATodos();
      }
      return;
    }

    if (cliente.idEquipoRemoto && agentesEnNube.has(cliente.idEquipoRemoto)) {
      const reg = agentesEnNube.get(cliente.idEquipoRemoto);
      reg.controladores.delete(cliente);
      let quedanAutenticados = 0;
      for (const c of reg.controladores) {
        if (c.autenticado && c.readyState === ESTADO_ABIERTO) quedanAutenticados++;
      }
      if (quedanAutenticados === 0 && reg.socket && reg.socket.readyState === ESTADO_ABIERTO) {
        enviarJsonACliente(reg.socket, { tipo: 'pausar_captura_nube' });
      }
    }

    if (!hayConsumidoresLocalesActivos() && temporizadorCaptura) {
      clearTimeout(temporizadorCaptura);
      temporizadorCaptura = null;
    }
  });
});

// Temporizador de telemetría cada 1 segundo y desbloqueo de seguridad para capturas
setInterval(() => {
  const autenticadosLocales = obtenerClientesAutenticadosLocales();
  const fpsReales = framesEnviadosSegundo;
  const kbpsActuales = Math.round((bytesEnviadosSegundo * 8) / 1000);

  framesEnviadosSegundo = 0;
  bytesEnviadosSegundo = 0;

  if (hayConsumidoresLocalesActivos()) {
    difundirJsonAutenticados({
      tipo: 'telemetria',
      fps: fpsReales,
      kbps: kbpsActuales,
      clientes: autenticadosLocales.length + (nubeAutenticadaActiva ? 1 : 0),
      monitor: estadoConfiguracion.monitor
    });

    if (capturaEnCurso && Date.now() - momentoUltimaCaptura > 1500) {
      capturaEnCurso = false;
      programarSiguienteCaptura();
    } else if (!capturaEnCurso && !temporizadorCaptura) {
      programarSiguienteCaptura();
    }
  }
}, 1000);

// =========================================================================
// Conexión saliente automática del .exe hacia la API / Hub en la Nube
// =========================================================================
let temporizadorReconexionNube = null;

function normalizarUrlHttpNube(urlCruda) {
  let u = (urlCruda || '').trim();
  if (!u) return '';
  if (u.startsWith('ws://')) u = 'http://' + u.slice(5);
  else if (u.startsWith('wss://')) u = 'https://' + u.slice(6);
  else if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}

async function enviarLatidoHttpNube() {
  if (!esWindows) return;
  const urlBaseHttp = normalizarUrlHttpNube(configuracion.urlNube);
  if (!urlBaseHttp || typeof fetch === 'undefined') return;
  try {
    const resp = await fetch(`${urlBaseHttp}/api/equipos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idEquipo: configuracion.idEquipo,
        usuario: obtenerNombreUsuarioLocal(),
        urlTunel: urlPublicaTunel || '',
        monitores: listaMonitores.length || 1
      })
    });
    if (resp.ok) {
      conectadoANube = true;
    }
  } catch (err) {
    // Ignorar error de red temporal
  }
}

setInterval(enviarLatidoHttpNube, 20000);

function normalizarUrlWsNube(urlCruda) {
  let u = (urlCruda || '').trim();
  if (!u) return '';
  if (u.startsWith('http://')) u = 'ws://' + u.slice(7);
  else if (u.startsWith('https://')) u = 'wss://' + u.slice(8);
  else if (!u.startsWith('ws://') && !u.startsWith('wss://')) u = 'wss://' + u;
  return u.replace(/\/+$/, '');
}

function iniciarConexionHaciaApiNube() {
  if (!esWindows) return;
  if (temporizadorReconexionNube) {
    clearTimeout(temporizadorReconexionNube);
    temporizadorReconexionNube = null;
  }

  if (socketHaciaNube) {
    try {
      socketHaciaNube.close();
    } catch (err) {
      // Ignorar
    }
    socketHaciaNube = null;
  }

  const urlWs = normalizarUrlWsNube(configuracion.urlNube);
  enviarLatidoHttpNube();
  if (!urlWs || typeof WebSocket === 'undefined') {
    conectadoANube = false;
    nubeAutenticadaActiva = false;
    return;
  }

  console.log(`[NUBE] Conectando este equipo (${configuracion.idEquipo}) con la API en la nube: ${urlWs}...`);

  try {
    const wsNube = new WebSocket(urlWs);
    wsNube.binaryType = 'arraybuffer';
    socketHaciaNube = wsNube;

    wsNube.addEventListener('open', () => {
      conectadoANube = true;
      console.log(`[OK NUBE] Equipo '${configuracion.idEquipo}' registrado en línea en ${urlWs}`);
      wsNube.send(
        JSON.stringify({
          tipo: 'registrar_agente',
          idEquipo: configuracion.idEquipo,
          usuario: obtenerNombreUsuarioLocal(),
          monitores: listaMonitores
        })
      );
    });

    wsNube.addEventListener('message', (evento) => {
      if (typeof evento.data !== 'string') return;
      let msg;
      try {
        msg = JSON.parse(evento.data);
      } catch (err) {
        return;
      }

      if (msg.tipo === 'autenticar_controlador_nube') {
        const exito = msg.clave === configuracion.claveAcceso;
        if (exito) {
          nubeAutenticadaActiva = true;
          enviarComandoMotor('MONITORES\n');
          programarSiguienteCaptura();
        }
        wsNube.send(
          JSON.stringify({
            tipo: 'respuesta_autenticacion_nube',
            idSesion: msg.idSesion,
            exito,
            mensaje: exito ? 'Conectado' : 'Clave de acceso incorrecta',
            configuracion: estadoConfiguracion,
            monitores: listaMonitores,
            monitorActual: estadoConfiguracion.monitor
          })
        );
        return;
      }

      if (msg.tipo === 'pausar_captura_nube') {
        nubeAutenticadaActiva = false;
        return;
      }

      if (nubeAutenticadaActiva) {
        ejecutarComandoControlLocal(msg, (resp) => {
          if (wsNube.readyState === 1) {
            wsNube.send(JSON.stringify(resp));
          }
        });
      }
    });

    wsNube.addEventListener('close', () => {
      conectadoANube = false;
      nubeAutenticadaActiva = false;
      if (configuracion.urlNube) {
        temporizadorReconexionNube = setTimeout(iniciarConexionHaciaApiNube, 4000);
      }
    });

    wsNube.addEventListener('error', () => {
      conectadoANube = false;
    });
  } catch (err) {
    conectadoANube = false;
    temporizadorReconexionNube = setTimeout(iniciarConexionHaciaApiNube, 5000);
  }
}

// =========================================================================
// Túnel Público HTTPS Instantáneo en Internet (sin configurar IP ni router)
// =========================================================================
function iniciarTunelPublico(puerto) {
  if (!esWindows || !configuracion.activarTunelAutomatico) return;
  const rutaSsh = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';
  if (!fs.existsSync(rutaSsh)) return;

  try {
    procesoTunel = spawn(
      rutaSsh,
      [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=NUL',
        '-o', 'ServerAliveInterval=30',
        '-R', `80:localhost:${puerto}`,
        'nokey@localhost.run'
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );

    const buscarUrlEnTexto = (fragmento) => {
      const texto = fragmento.toString('utf8');
      const coincidencia = texto.match(/https:\/\/[a-zA-Z0-9.-]+\.lhr\.life/);
      if (coincidencia && coincidencia[0] && urlPublicaTunel !== coincidencia[0]) {
        urlPublicaTunel = coincidencia[0];
        console.log('===========================================================');
        console.log(`  [NUBE ACTIVA] URL Pública de Internet (Sin IP local):`);
        console.log(`  >>> ${urlPublicaTunel} <<<`);
        console.log('===========================================================');
        enviarLatidoHttpNube();
      }
    };

    procesoTunel.stdout.on('data', buscarUrlEnTexto);
    procesoTunel.stderr.on('data', buscarUrlEnTexto);
    procesoTunel.on('error', () => {});
  } catch (err) {
    // Ignorar si SSH no está disponible
  }
}

// Mostrar direcciones IP locales y VPN disponibles al iniciar el servidor
function mostrarDireccionesRed(puerto) {
  const interfaces = os.networkInterfaces();
  console.log('===========================================================');
  console.log('  SERVIDOR DE ESCRITORIO REMOTO (Remoto_1) ACTIVO');
  console.log('===========================================================');
  console.log(`  Clave de acceso : ${configuracion.claveAcceso}`);
  console.log(`  URL Local       : http://localhost:${puerto}`);

  for (const [nombreInterfaz, direcciones] of Object.entries(interfaces)) {
    if (!direcciones) continue;
    for (const dir of direcciones) {
      if (dir.family === 'IPv4' && !dir.internal) {
        console.log(`  Red (${nombreInterfaz}) : http://${dir.address}:${puerto}`);
      }
    }
  }
  console.log('===========================================================');
}

// Iniciar servidor HTTP, motor nativo, registro en API en la nube y túnel público
servidorHttp.listen(configuracion.puerto, '0.0.0.0', () => {
  mostrarDireccionesRed(configuracion.puerto);
  iniciarMotorNativo();
  if (configuracion.urlNube) {
    iniciarConexionHaciaApiNube();
  }
  iniciarTunelPublico(configuracion.puerto);
});

// Limpieza ordenada al cerrar el proceso de Node.js
function cerrarServidorOrdenadamente() {
  if (procesoTunel) {
    try {
      procesoTunel.kill();
    } catch (err) {
      // Ignorar
    }
  }
  if (procesoMotor) {
    enviarComandoMotor('SALIR\n');
    try {
      procesoMotor.kill();
    } catch (err) {
      // Ignorar si ya cerró
    }
  }
  process.exit(0);
}

process.on('SIGINT', cerrarServidorOrdenadamente);
process.on('SIGTERM', cerrarServidorOrdenadamente);
