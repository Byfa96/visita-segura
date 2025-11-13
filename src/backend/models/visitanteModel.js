const database = require('../database/database');


class VisitanteModel {
  async registrarIngreso(rut, nombre, { area_id = null, area = null } = {}) {
    const fecha = new Date();
    const fechaIngreso = fecha.toISOString().split('T')[0];
    const horaIngreso = fecha.toTimeString().split(' ')[0];


    return new Promise((resolve, reject) => {
      const db = database.db;

      const ensureAreaId = (cb) => {
        if (area_id != null) return cb(null, area_id);
        const areaNombre = typeof area === 'string' ? area.trim() : null;
        if (!areaNombre) return cb(null, null);
        const upsertArea = `INSERT INTO areas(nombre) VALUES (?) ON CONFLICT(nombre) DO NOTHING`;
        db.run(upsertArea, [areaNombre], () => {
          // Ignorar error si ya existe
          db.get(`SELECT id FROM areas WHERE nombre = ?`, [areaNombre], (e, row) => {
            if (e) return cb(e);
            cb(null, row ? row.id : null);
          });
        });
      };

      ensureAreaId((areaErr, areaIdFinal) => {
        if (areaErr) return reject(areaErr);

        const cols = ['rut', 'nombre', 'fecha_ingreso', 'hora_ingreso'];
        const placeholders = ['?', '?', '?', '?'];
        const params = [rut, nombre, fechaIngreso, horaIngreso];
        if (areaIdFinal != null) {
          cols.push('area_id');
          placeholders.push('?');
          params.push(areaIdFinal);
        }

        const sql = `INSERT INTO visitantes (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;

        db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            rut,
            nombre,
            fecha_ingreso: fechaIngreso,
            hora_ingreso: horaIngreso,
            area_id: areaIdFinal || null
          });
        }
        });
      });
    });
  }


  async registrarSalida(rut) {
    const fecha = new Date();
    const fechaSalida = fecha.toISOString().split('T')[0];
    const horaSalida = fecha.toTimeString().split(' ')[0];


    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE visitantes 
        SET fecha_salida = ?, hora_salida = ?, estado = 'completado' 
        WHERE rut = ? AND fecha_salida IS NULL
      `;


  database.db.run(sql, [fechaSalida, horaSalida, rut], function(err) {
        if (err) {
          reject(err);
        } else {
          if (this.changes === 0) {
            reject(new Error('No se encontró un visitante con ese RUT sin salida registrada'));
          } else {
            resolve({
              rut,
              fecha_salida: fechaSalida,
              hora_salida: horaSalida
            });
          }
        }
      });
    });
  }


  async obtenerTodos() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM visitantes ORDER BY created_at DESC`;


      database.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }


  async obtenerPorRut(rut) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM visitantes WHERE rut = ?`;


      database.db.get(sql, [rut], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }
}


module.exports = new VisitanteModel();
