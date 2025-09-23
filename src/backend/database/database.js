const sqlite3 = require('sqlite3').verbose();
const path = require('path');


const DB_PATH = path.join(__dirname, '../visitas.db');


class Database {
  constructor() {
    this.db = null;
  }


  connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          console.error('Error al conectar con la base de datos:', err.message);
          reject(err);
        } else {
          console.log('Conectado a la base de datos SQLite.');
          this.createTable()
            .then(() => resolve(this.db))
            .catch(reject);
        }
      });
    });
  }


  createTable() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS visitantes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rut TEXT NOT NULL UNIQUE,
          nombre TEXT NOT NULL,
          fecha_ingreso TEXT NOT NULL,
          hora_ingreso TEXT NOT NULL,
          fecha_salida TEXT,
          hora_salida TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;


      this.db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Tabla "visitantes" verificada/creada correctamente.');
          resolve();
        }
      });
    });
  }


  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error al cerrar la base de datos:', err.message);
        } else {
          console.log('Conexión a la base de datos cerrada.');
        }
      });
    }
  }
}


module.exports = new Database();