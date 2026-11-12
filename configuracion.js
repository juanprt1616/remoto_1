// Configuración central del servidor, agente local y retransmisor en la nube (Hub API)
const os = require('os');
const fs = require('fs');
const path = require('path');

let urlNubeGuardada = '';
try {
  const rutaArchivoNube = path.join(__dirname, 'url_nube.txt');
  if (fs.existsSync(rutaArchivoNube)) {
    urlNubeGuardada = fs.readFileSync(rutaArchivoNube, 'utf8').trim();
  }
} catch (err) {
  // Ignorar si no existe
}

const configuracion = {
  puerto: parseInt(process.env.PORT || process.env.PUERTO || '8080', 10),
  claveAcceso: process.env.CLAVE_REMOTA || 'remoto123',
  idEquipo: process.env.ID_EQUIPO || os.hostname() || 'PC-REMOTO',
  urlNube: process.env.URL_NUBE || urlNubeGuardada || '',
  activarTunelAutomatico: process.env.TUNEL_AUTO !== 'false',
  calidadInicial: parseInt(process.env.CALIDAD_INICIAL || '70', 10),
  fpsInicial: parseInt(process.env.FPS_INICIAL || '20', 10),
  escalaInicial: parseFloat(process.env.ESCALA_INICIAL || '0.8'),
  monitorInicial: parseInt(process.env.MONITOR_INICIAL || '0', 10)
};

module.exports = configuracion;
