const database = require('../database/database');


class VisitanteModel {
  async registrarIngreso(rut, nombre, { area_id = null, area = null } = {}) {
    const ahora = new Date();
    const fechaIngreso = ahora.toISOString().split('T')[0];
    const horaIngreso = ahora.toTimeString().split(' ')[0];
    const ingresoTs = `${fechaIngreso}T${horaIngreso}`;

    return new Promise((resolve, reject) => {
      const db = database.db;
      const registradoPor = process.env.USERNAME || process.env.USER || require('os').userInfo().username || null;

      // Verificar visita abierta existente (legacy: UNIQUE rut)
      const checkSql = `SELECT v.id FROM visitas v JOIN personas p ON p.id = v.persona_id WHERE p.rut = ? AND v.salida_ts IS NULL AND (v.estado IS NULL OR v.estado NOT IN ('completado','expirado')) LIMIT 1`;
      db.get(checkSql, [rut], (chkErr, openRow) => {
        if (chkErr) return reject(chkErr);
        if (openRow) return reject(new Error('UNIQUE constraint failed: visitantes.rut'));

        // Asegurar persona
        const upsertPersona = `INSERT INTO personas(rut, nombre) VALUES (?, ?) ON CONFLICT(rut) DO UPDATE SET nombre=excluded.nombre`;
        db.run(upsertPersona, [rut, nombre], (perErr) => {
          if (perErr) return reject(perErr);

          const ensureAreaId = (cb) => {
            if (area_id != null) return cb(null, area_id);
            const areaNombre = typeof area === 'string' ? area.trim() : null;
            if (!areaNombre) return cb(null, null);
            const upsertArea = `INSERT INTO areas(nombre) VALUES (?) ON CONFLICT(nombre) DO NOTHING`;
            db.run(upsertArea, [areaNombre], () => {
              db.get(`SELECT id FROM areas WHERE nombre = ?`, [areaNombre], (e, row) => {
                if (e) return cb(e);
                cb(null, row ? row.id : null);
              });
            });
          };

            ensureAreaId((areaErr, areaIdFinal) => {
            if (areaErr) return reject(areaErr);
            const insertVisita = `INSERT INTO visitas(persona_id, fecha_ingreso, hora_ingreso, ingreso_ts, area_id, estado, registrado_por) VALUES ((SELECT id FROM personas WHERE rut = ?), ?, ?, ?, ?, 'activo', ?)`;
            db.run(insertVisita, [rut, fechaIngreso, horaIngreso, ingresoTs, areaIdFinal, registradoPor], function (insErr) {
              if (insErr) return reject(insErr);
              // Recuperar nombre del área si existe
              if (areaIdFinal) {
                db.get(`SELECT nombre FROM areas WHERE id = ?`, [areaIdFinal], (aErr, aRow) => {
                  if (aErr) return resolve({
                    id: this.lastID,
                    rut,
                    nombre,
                    fecha_ingreso: fechaIngreso,
                    hora_ingreso: horaIngreso,
                    area_id: areaIdFinal || null,
                    area_nombre: null,
                    registrado_por: registradoPor
                  });
                  resolve({
                    id: this.lastID,
                    rut,
                    nombre,
                    fecha_ingreso: fechaIngreso,
                    hora_ingreso: horaIngreso,
                    area_id: areaIdFinal || null,
                    area_nombre: aRow ? aRow.nombre : null,
                    registrado_por: registradoPor
                  });
                });
              } else {
                resolve({
                  id: this.lastID,
                  rut,
                  nombre,
                  fecha_ingreso: fechaIngreso,
                  hora_ingreso: horaIngreso,
                  area_id: null,
                  area_nombre: null,
                  registrado_por: registradoPor
                });
              }
            });
          });
        });
      });
    });
  }

  async registrarSalida(rut) {
    const ahora = new Date();
    const fechaSalida = ahora.toISOString().split('T')[0];
    const horaSalida = ahora.toTimeString().split(' ')[0];
    const salidaTs = `${fechaSalida}T${horaSalida}`;

    return new Promise((resolve, reject) => {
      const db = database.db;
      const findSql = `SELECT v.id FROM visitas v JOIN personas p ON p.id = v.persona_id WHERE p.rut = ? AND v.salida_ts IS NULL ORDER BY v.id DESC LIMIT 1`;
      db.get(findSql, [rut], (fErr, row) => {
        if (fErr) return reject(fErr);
        if (!row) return reject(new Error('No se encontró un visitante con ese RUT sin salida registrada'));
        const updSql = `UPDATE visitas SET fecha_salida = ?, hora_salida = ?, salida_ts = ?, estado = 'completado' WHERE id = ?`;
        db.run(updSql, [fechaSalida, horaSalida, salidaTs, row.id], function (uErr) {
          if (uErr) return reject(uErr);
          resolve({ rut, fecha_salida: fechaSalida, hora_salida: horaSalida });
        });
      });
    });
  }

  async obtenerTodos() {
    return new Promise((resolve, reject) => {
      // Devolver visitas con información del área (si existe)
      const sql = `
        SELECT
          v.id AS id,
          p.rut AS rut,
          p.nombre AS nombre,
          COALESCE(substr(v.ingreso_ts,1,10), v.fecha_ingreso) AS fecha_ingreso,
          COALESCE(substr(v.ingreso_ts,12,8), v.hora_ingreso) AS hora_ingreso,
          CASE WHEN v.salida_ts IS NOT NULL THEN substr(v.salida_ts,1,10) ELSE v.fecha_salida END AS fecha_salida,
          CASE WHEN v.salida_ts IS NOT NULL THEN substr(v.salida_ts,12,8) ELSE v.hora_salida END AS hora_salida,
          v.registrado_por AS registrado_por,
          v.created_at AS created_at,
          v.area_id AS area_id,
          a.nombre AS area_nombre,
          v.estado AS estado
        FROM visitas v
        JOIN personas p ON p.id = v.persona_id
        LEFT JOIN areas a ON a.id = v.area_id
        ORDER BY v.created_at DESC`;

      database.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  async obtenerPorRut(rut) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          v.id AS id,
          p.rut AS rut,
          p.nombre AS nombre,
          COALESCE(substr(v.ingreso_ts,1,10), v.fecha_ingreso) AS fecha_ingreso,
          COALESCE(substr(v.ingreso_ts,12,8), v.hora_ingreso) AS hora_ingreso,
          CASE WHEN v.salida_ts IS NOT NULL THEN substr(v.salida_ts,1,10) ELSE v.fecha_salida END AS fecha_salida,
          CASE WHEN v.salida_ts IS NOT NULL THEN substr(v.salida_ts,12,8) ELSE v.hora_salida END AS hora_salida,
          v.registrado_por AS registrado_por,
          v.created_at AS created_at,
          v.area_id AS area_id,
          a.nombre AS area_nombre,
          v.estado AS estado
        FROM visitas v
        JOIN personas p ON p.id = v.persona_id
        LEFT JOIN areas a ON a.id = v.area_id
        WHERE p.rut = ?
        ORDER BY v.id DESC LIMIT 1`;

      database.db.get(sql, [rut], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }
}


module.exports = new VisitanteModel();
