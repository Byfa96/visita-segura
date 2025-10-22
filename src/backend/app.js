const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const database = require('./database/database');
const visitantesRoutes = require('./routes/visitantesRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas principales
app.use('/api', visitantesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

/* ===========================================================
    RUTA MANUAL PARA GENERAR REPORTE Y REINICIAR BASE DE DATOS
   =========================================================== */
app.post('/api/generar-reporte', async (req, res) => {
  try {
    const db = database.db;
    const fecha = new Date();
    const fechaString = fecha.toISOString().split('T')[0];
    const timestamp = fecha.getTime(); // Agregar timestamp único

    const reportsDir = path.join(__dirname, 'reportes');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);

    // Agregar timestamp al nombre del archivo para hacerlo único
    const reportePath = path.join(reportsDir, `reporte_${fechaString}_${timestamp}.csv`);

    db.all("SELECT * FROM visitantes", (err, rows) => {
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

      // Vaciar la base de datos
      db.run("DELETE FROM visitantes", (err) => {
        if (err) {
          console.error('Error al vaciar la tabla:', err);
          return res.status(500).json({ error: 'Error al vaciar la base de datos' });
        }

        console.log(' Base de datos reiniciada después del reporte.');
        res.status(200).json({
          message: 'Reporte generado y base de datos reiniciada correctamente.',
          archivo: path.basename(reportePath),
          registros: rows.length
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

  db.all("SELECT * FROM visitantes", (err, rows) => {
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

    db.run("DELETE FROM visitantes", (err) => {
      if (err) {
        console.error(' Error al vaciar la tabla:', err);
      } else {
        console.log(' Base de datos reiniciada después del reporte diario.');
      }
    });
  });
}

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

    app.listen(PORT, 'localhost', () => {
      console.log(` Servidor backend corriendo en http://localhost:${PORT}`);
    });
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
app.delete('/api/eliminar-reporte/:nombre', (req, res) => {
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