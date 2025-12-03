const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const cron = require('node-cron');
const database = require('./database/database');
const visitantesRoutes = require('./routes/visitantesRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = 3000;
const SSL_PORT = 3443;

// Estado en memoria para último scan del escáner móvil
let lastScan = null;

// Sesiones simples en memoria (token -> { username, role, createdAt })
const sessions = new Map();

// Helper para obtener sesión desde header
function getSessionFromRequest(req) {
  const token = req.headers['x-auth-token'] || req.headers['authorization'] && String(req.headers['authorization']).replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return sessions.get(token) || null;
}

function requireRole(role) {
  return (req, res, next) => {
    const sess = getSessionFromRequest(req);
    if (!sess) return res.status(401).json({ error: 'No autorizado: token inválido o ausente' });
    if (sess.role !== role) return res.status(403).json({ error: 'Acceso denegado: permiso insuficiente' });
    req.user = { username: sess.username, role: sess.role };
    next();
  };
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Servir página de escáner para usar desde el celular
app.use('/scanner', express.static(path.join(__dirname, 'public', 'scanner')));

// Rutas principales
app.use('/api', visitantesRoutes);
// Listar áreas disponibles
app.get('/api/areas', (req, res) => {
  const db = database.db;
  if (!db) return res.status(500).json({ error: 'DB no disponible' });
  db.all('SELECT id, nombre, descripcion FROM areas ORDER BY nombre ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener áreas' });
    res.json({ success: true, data: rows });
  });
});
// Landing simple para GET /
app.get('/', (req, res) => {
  res.type('html').send(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Visita Segura · Backend</title>
        <style>
          body{font-family:system-ui,Arial,sans-serif;margin:0;padding:24px;background:#0b1220;color:#e6e9ef}
          .card{background:#131a2a;border:1px solid #2a3550;border-radius:12px;padding:16px;max-width:800px;margin:0 auto}
          a{color:#9db1ff;text-decoration:none}
          ul{line-height:1.8}
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Visita Segura · Backend</h2>
          <p>Enlaces útiles:</p>
          <ul>
            <li><a href="/health">/health</a> (estado)</li>
            <li><a href="/scanner">/scanner</a> (escáner móvil)</li>
            <li><a href="/api/visitas">/api/visitas</a> (lista de visitas)</li>
            <li><a href="/api/reportes">/api/reportes</a> (lista de reportes)</li>
          </ul>
        </div>
      </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

/* ===========================================================
    RUTA QUIÉN SOY (usuario del sistema)
   =========================================================== */
app.get('/api/whoami', (req, res) => {
  try {
    const os = require('os');
    const user = process.env.USERNAME || process.env.USER || os.userInfo().username || 'desconocido';
    const hostname = os.hostname();
    res.json({ user, hostname });
  } catch (e) {
    res.json({ user: 'desconocido' });
  }
});

/* ===========================================================
    RUTA INFO SCANNER (URLS de acceso)
   =========================================================== */
app.get('/api/scanner-info', (req, res) => {
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    const urls = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          urls.push(`http://${net.address}:${PORT}/scanner`);
          urls.push(`https://${net.address}:${SSL_PORT}/scanner`);
        }
      }
    }
    res.json({ urls });
  } catch (e) {
    res.json({ urls: [] });
  }
});

/* ===========================================================
   SINCRONIZACIÓN SCANNER → ESCRITORIO (staging en memoria)
   =========================================================== */
app.post('/api/scan-update', (req, res) => {
  try {
    const { raw = '', rut = '', nombre = '', area = '' } = req.body || {};
    lastScan = {
      raw: typeof raw === 'string' ? raw : '',
      rut: typeof rut === 'string' ? rut : '',
      nombre: typeof nombre === 'string' ? nombre : '',
      area: typeof area === 'string' ? area : '',
      ts: Date.now()
    };
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: 'Formato inválido' });
  }
});

app.get('/api/last-scan', (req, res) => {
  if (!lastScan) return res.json({ data: null });
  // Compatibilidad con lógica actual (data simple) y campos estructurados
  const prefer = lastScan.rut || lastScan.nombre || lastScan.raw || '';
  res.json({
    data: prefer,
    raw: lastScan.raw,
    rut: lastScan.rut,
    nombre: lastScan.nombre,
    area: lastScan.area,
    ts: lastScan.ts
  });
});

// Login simple: username + password (comparación SHA256)
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });

    const db = database.db;
    if (!db) return res.status(500).json({ error: 'DB no disponible' });

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(String(password)).digest('hex');

    db.get(`SELECT username, role FROM app_users WHERE username = ? AND password_hash = ?`, [username, hash], (err, row) => {
      if (err) return res.status(500).json({ error: 'Error al autenticar' });
      if (!row) return res.status(401).json({ error: 'Credenciales inválidas' });

      // Crear token de sesión en memoria
      const token = require('crypto').randomBytes(24).toString('hex');
      sessions.set(token, { username: row.username, role: row.role, createdAt: Date.now() });

      res.json({ success: true, token, username: row.username, role: row.role });
    });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/logout', (req, res) => {
  try {
    const token = req.headers['x-auth-token'] || (req.body && req.body.token);
    if (token && sessions.has(token)) sessions.delete(token);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

app.get('/api/me', (req, res) => {
  const sess = getSessionFromRequest(req);
  if (!sess) return res.json({ authenticated: false });
  res.json({ authenticated: true, username: sess.username, role: sess.role });
});

// Listar usuarios (solo admin)
app.get('/api/users', requireRole('admin'), (req, res) => {
  const db = database.db;
  if (!db) return res.status(500).json({ error: 'DB no disponible' });
  db.all('SELECT id, username, role FROM app_users ORDER BY username ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener usuarios' });
    res.json({ success: true, users: rows });
  });
});

// Cambiar contraseña (admin -> puede cambiar cualquier cuenta)
app.post('/api/change-password', requireRole('admin'), (req, res) => {
  try {
    const { username, newPassword } = req.body || {};
    if (!username || !newPassword) return res.status(400).json({ error: 'username y newPassword requeridos' });
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(String(newPassword)).digest('hex');
    const db = database.db;
    db.run('UPDATE app_users SET password_hash = ? WHERE username = ?', [hash, username], function (err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar contraseña' });
      if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json({ success: true, message: 'Contraseña actualizada' });
    });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Cambiar mi contraseña (autenticado) — requiere oldPassword
// Cambiar contraseña (solo admin) - reemplaza change-my-password para forzar admin-only
app.post('/api/change-my-password', requireRole('admin'), (req, res) => {
  try {
    const { username, newPassword } = req.body || {};
    const targetUser = username || (req.user && req.user.username);
    if (!targetUser || !newPassword) return res.status(400).json({ error: 'username y newPassword requeridos' });
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(String(newPassword)).digest('hex');
    const db = database.db;
    db.run('UPDATE app_users SET password_hash = ? WHERE username = ?', [hash, targetUser], function (err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar contraseña' });
      if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json({ success: true, message: 'Contraseña actualizada' });
    });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ===========================================================
    RUTA MANUAL PARA GENERAR REPORTE Y REINICIAR BASE DE DATOS
   =========================================================== */
app.post('/api/generar-reporte', requireRole('admin'), async (req, res) => {
  try {
    const db = database.db;
    const fecha = new Date();
    const fechaString = fecha.toISOString().split('T')[0];
    const timestamp = fecha.getTime(); // Agregar timestamp único

    const reportsDir = path.join(__dirname, 'reportes');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);

    // Agregar timestamp al nombre del archivo para hacerlo único
    const reportePath = path.join(reportsDir, `reporte_${fechaString}_${timestamp}.csv`);

    db.all(`SELECT v.id, p.rut, p.nombre, v.fecha_ingreso, v.hora_ingreso, v.fecha_salida, v.hora_salida, v.created_at, v.area_id, a.nombre AS area_nombre
      FROM visitas v
      JOIN personas p ON p.id = v.persona_id
      LEFT JOIN areas a ON a.id = v.area_id`, (err, rows) => {
      if (err) {
        console.error('Error al obtener los datos:', err);
        return res.status(500).json({ error: 'Error al generar reporte' });
      }

      if (rows.length === 0) {
        return res.status(200).json({ message: 'No hay registros para exportar.' });
      }

      // Convertir a CSV
      const headers = Object.keys(rows[0]).join(',') + '\n';
      const data = rows.map(row => Object.values(row).join(',')).join('\n');
      const csv = headers + data;

      // Guardar archivo CSV
      fs.writeFileSync(reportePath, csv, 'utf8');
      console.log(` Reporte manual generado: ${reportePath}`);

      // PURGAR historial: eliminar todas las filas en 'visitas' (se conserva catálogo de personas y áreas)
      const deleted = rows.length;
      db.run('DELETE FROM visitas', (delErr) => {
        if (delErr) {
          console.error('Error al purgar visitas tras generar reporte:', delErr.message || delErr);
          // aunque la exportación estuvo bien, respondemos informando el problema con la limpieza
          return res.status(200).json({
            message: 'Reporte generado, pero hubo un error al limpiar el historial.',
            archivo: path.basename(reportePath),
            registros_exportados: rows.length,
            purge_error: String(delErr && delErr.message ? delErr.message : delErr)
          });
        }

        console.log(`Historial purgado: ${deleted} visita(s) eliminadas.`);
        res.status(200).json({
          message: 'Reporte generado y historial limpiado.',
          archivo: path.basename(reportePath),
          registros_exportados: rows.length,
          registros_eliminados: deleted
        });
      });
    });
  } catch (error) {
    console.error('Error en /api/generar-reporte:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

/* ===========================================================
    TAREA AUTOMÁTICA DIARIA (A MEDIANOCHE)
   =========================================================== */
async function generarReporteDiario() {
  const db = database.db;
  if (!db) {
    console.error('No hay conexión a la base de datos.');
    return;
  }

  const fecha = new Date();
  const fechaString = fecha.toISOString().split('T')[0];
  const timestamp = fecha.getTime(); // Agregar timestamp único
  
  const reportsDir = path.join(__dirname, 'reportes');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);
  
  // Agregar timestamp al nombre del archivo para hacerlo único
  const reportePath = path.join(reportsDir, `reporte_${fechaString}_${timestamp}.csv`);

  console.log(' Generando reporte diario...');

    db.all(`SELECT v.id, p.rut, p.nombre, v.fecha_ingreso, v.hora_ingreso, v.fecha_salida, v.hora_salida, v.created_at, v.area_id, a.nombre AS area_nombre
      FROM visitas v
      JOIN personas p ON p.id = v.persona_id
      LEFT JOIN areas a ON a.id = v.area_id`, (err, rows) => {
    if (err) {
      console.error('Error al obtener los datos:', err);
      return;
    }

    if (rows.length === 0) {
      console.log(' No hay registros para exportar.');
      return;
    }

    const headers = Object.keys(rows[0]).join(',') + '\n';
    const data = rows.map(row => Object.values(row).join(',')).join('\n');
    const csv = headers + data;

    fs.writeFileSync(reportePath, csv, 'utf8');
    console.log(` Reporte diario generado: ${reportePath}`);
    console.log(` Registros exportados: ${rows.length}`);

    // Purgar historial tras reporte diario: eliminar todas las visitas
    const deleted = rows.length;
    database.db.run('DELETE FROM visitas', (delErr) => {
      if (delErr) {
        console.error('Error al purgar visitas después del reporte diario:', delErr.message || delErr);
      } else {
        console.log(`Historial purgado tras reporte diario: ${deleted} visita(s) eliminadas.`);
      }
    });
  });
}

/* ===========================================================
    EXPIRACIÓN AUTOMÁTICA DE VISITAS (6h)
   =========================================================== */
let lastExpireRun = null;
async function marcarExpirados(horas = 6) {
  const db = database.db;
  if (!db) return;
  const ahora = new Date();
  const limiteMs = horas * 60 * 60 * 1000;

    db.all("SELECT id, rut, nombre, fecha_ingreso, hora_ingreso, estado FROM visitantes WHERE fecha_salida IS NULL AND (estado IS NULL OR estado <> 'expirado')", (err, rows) => {
    if (err || !rows || rows.length === 0) {
      lastExpireRun = { time: ahora, updated: 0 };
      return;
    }
    let updated = 0;
    const updateVisitStmt = db.prepare("UPDATE visitas SET estado = 'expirado' WHERE id = ?");
    for (const r of rows) {
      const ingreso = new Date(`${r.fecha_ingreso}T${r.hora_ingreso}`);
      if (ahora - ingreso >= limiteMs) {
        updateVisitStmt.run([r.id]);
        updated++;
      }
    }
    updateVisitStmt.finalize();
    lastExpireRun = { time: ahora, updated };
    if (updated > 0) {
      console.log(` Expiración automática: ${updated} visita(s) marcadas como expiradas (> ${horas}h).`);
    }
  });
}

// Ejecutar cada 10 minutos
cron.schedule('*/10 * * * *', () => marcarExpirados(6));

// Endpoint para revisar expirados actuales
app.get('/api/expirados', (req, res) => {
  const db = database.db;
  if (!db) return res.json({ total: 0, data: [] });
  db.all("SELECT * FROM visitantes WHERE fecha_salida IS NULL AND estado = 'expirado' ORDER BY created_at DESC", (err, rows) => {
    if (err) return res.json({ total: 0, data: [] });
    res.json({ total: rows.length, data: rows, lastRun: lastExpireRun });
  });
});

// Se ejecuta cada medianoche
cron.schedule('0 0 * * *', () => {
  console.log(' Ejecutando tarea programada (reporte diario)...');
  generarReporteDiario();
});

/* ===========================================================
    INICIALIZACIÓN DEL SERVIDOR
   =========================================================== */
async function startServer() {
  try {
    await database.connect();

    // Levantar HTTP siempre
    const httpServer = http.createServer(app);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(` HTTP listo:   http://localhost:${PORT} (accesible en la red local)`);
    });

    // Intentar levantar HTTPS si existen certificados en src/backend/certs
    const certsDir = path.join(__dirname, 'certs');
    const candidates = [
      { key: 'key.pem', cert: 'cert.pem' },
      // mkcert con IP/host en nombre
      { key: '192.168.1.7+2-key.pem', cert: '192.168.1.7+2.pem' },
    ];

    for (const c of candidates) {
      const keyPath = path.join(certsDir, c.key);
      const certPath = path.join(certsDir, c.cert);
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        try {
          const options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
          };
          const httpsServer = https.createServer(options, app);
          httpsServer.listen(SSL_PORT, '0.0.0.0', () => {
            console.log(` HTTPS listo: https://localhost:${SSL_PORT} (usa esta URL en el móvil para cámara)`);
          });
        } catch (e) {
          console.warn(' No se pudo iniciar HTTPS:', e.message);
        }
        break;
      }
    }

    // Primera ejecución de expiración al iniciar
    marcarExpirados(6);
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

/* ===========================================================
    RUTA PARA LISTAR REPORTES EXISTENTES
   =========================================================== */
app.get('/api/reportes', (req, res) => {
  try {
    const reportsDir = path.join(__dirname, 'reportes');
    
    if (!fs.existsSync(reportsDir)) {
      return res.json({ reportes: [] });
    }

    const archivos = fs.readdirSync(reportsDir)
      .filter(archivo => archivo.startsWith('reporte_') && archivo.endsWith('.csv'))
      .map(archivo => {
        const stats = fs.statSync(path.join(reportsDir, archivo));
        return {
          nombre: archivo,
          ruta: path.join(reportsDir, archivo),
          tamaño: stats.size,
          fechaModificacion: stats.mtime
        };
      })
      .sort((a, b) => b.fechaModificacion - a.fechaModificacion); // Más recientes primero

    res.json({
      success: true,
      total: archivos.length,
      reportes: archivos
    });
  } catch (error) {
    console.error('Error al listar reportes:', error);
    res.status(500).json({ error: 'Error al listar reportes' });
  }
});

/* ===========================================================
    RUTA PARA DESCARGAR REPORTES
   =========================================================== */
app.get('/api/descargar-reporte/:nombre', (req, res) => {
  try {
    const { nombre } = req.params;
    const reportePath = path.join(__dirname, 'reportes', nombre);
    
    if (!fs.existsSync(reportePath)) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    res.download(reportePath);
  } catch (error) {
    console.error('Error al descargar reporte:', error);
    res.status(500).json({ error: 'Error al descargar reporte' });
  }
});

/* ===========================================================
    RUTA PARA ELIMINAR REPORTES
   =========================================================== */
app.delete('/api/eliminar-reporte/:nombre', requireRole('admin'), (req, res) => {
  try {
    const { nombre } = req.params;
    const reportePath = path.join(__dirname, 'reportes', nombre);
    
    if (!fs.existsSync(reportePath)) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    fs.unlinkSync(reportePath);
    res.json({ success: true, message: 'Reporte eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar reporte:', error);
    res.status(500).json({ error: 'Error al eliminar reporte' });
  }
});

startServer();

// Manejadores de error
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;