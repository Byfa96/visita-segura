const database = require('../database/database');


class VisitanteModel {
  async registrarIngreso(rut, nombre) {
    const fecha = new Date();
    const fechaIngreso = fecha.toISOString().split('T')[0];
    const horaIngreso = fecha.toTimeString().split(' ')[0];


    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO visitantes (rut, nombre, fecha_ingreso, hora_ingreso) 
        VALUES (?, ?, ?, ?)
      `;


      database.db.run(sql, [rut, nombre, fechaIngreso, horaIngreso], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            rut,
            nombre,
            fecha_ingreso: fechaIngreso,
            hora_ingreso: horaIngreso
          });
        }
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
        SET fecha_salida = ?, hora_salida = ? 
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
