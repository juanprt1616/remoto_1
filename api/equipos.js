// Endpoint Serverless para Vercel (/api/equipos)
// Permite que Remoto_1_Portable.exe registre automáticamente su nombre de equipo y su túnel HTTPS público
// para que al abrir la web en Vercel aparezca en "Equipos en Línea" sin escribir ninguna IP.

const registroEquiposMemoria = global.__remoto1Equipos || (global.__remoto1Equipos = new Map());
const TIEMPO_EXPIRACION_MS = 90 * 1000; // 90 segundos sin latido = desconectado

function limpiarExpirados() {
  const ahora = Date.now();
  for (const [id, info] of registroEquiposMemoria.entries()) {
    if (ahora - info.ultimoLatido > TIEMPO_EXPIRACION_MS) {
      registroEquiposMemoria.delete(id);
    }
  }
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  limpiarExpirados();

  if (req.method === 'POST') {
    const procesarCuerpo = (datos) => {
      try {
        const cuerpo = typeof datos === 'string' ? JSON.parse(datos || '{}') : (datos || {});
        const idEquipo = String(cuerpo.idEquipo || '').trim();
        if (!idEquipo) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ exito: false, mensaje: 'Falta idEquipo' }));
          return;
        }

        registroEquiposMemoria.set(idEquipo, {
          idEquipo,
          usuario: String(cuerpo.usuario || 'Windows'),
          urlTunel: String(cuerpo.urlTunel || ''),
          monitores: Number(cuerpo.monitores) || 1,
          esLocal: false,
          conectadoDesde: new Date().toLocaleTimeString(),
          ultimoLatido: Date.now()
        });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          exito: true,
          equipos: Array.from(registroEquiposMemoria.values())
        }));
      } catch (err) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ exito: false, mensaje: err.message }));
      }
    };

    if (req.body && typeof req.body === 'object') {
      procesarCuerpo(req.body);
    } else {
      let acumulado = '';
      req.on('data', (trozo) => {
        acumulado += trozo.toString('utf8');
      });
      req.on('end', () => procesarCuerpo(acumulado));
    }
    return;
  }

  // GET /api/equipos
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    equipos: Array.from(registroEquiposMemoria.values())
  }));
};
