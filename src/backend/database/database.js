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
          this.#initializeSchema()
            .then(() => resolve(this.db))
            .catch(reject);
        }
      });
    });
  }

  #initializeSchema() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Asegurar claves foráneas activas
        this.db.run('PRAGMA foreign_keys = ON');

        const statements = [
          // Tabla legacy usada por el código actual
          `CREATE TABLE IF NOT EXISTS visitantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rut TEXT NOT NULL UNIQUE,
            nombre TEXT NOT NULL,
            fecha_ingreso TEXT NOT NULL,
            hora_ingreso TEXT NOT NULL,
            fecha_salida TEXT,
            hora_salida TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,

          // Intentar agregar columna auxiliar para enlazar con visitas (ignorar si ya existe)
          `ALTER TABLE visitantes ADD COLUMN visita_id INTEGER`,

          // Tablas nuevas y más robustas
          `CREATE TABLE IF NOT EXISTS personas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rut TEXT NOT NULL UNIQUE,
            nombre TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,

          `CREATE TABLE IF NOT EXISTS areas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            descripcion TEXT
          )`,

          `CREATE TABLE IF NOT EXISTS visitas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            persona_id INTEGER NOT NULL,
            fecha_ingreso TEXT NOT NULL,
            hora_ingreso TEXT NOT NULL,
            fecha_salida TEXT,
            hora_salida TEXT,
            area_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (persona_id) REFERENCES personas(id),
            FOREIGN KEY (area_id) REFERENCES areas(id)
          )`,

          // Intentar agregar columnas nuevas si ya existía la DB (antes de crear índices/triggers)
          `ALTER TABLE visitantes ADD COLUMN area_id INTEGER`,
          `ALTER TABLE visitas ADD COLUMN area_id INTEGER`,

          // Índices útiles para rendimiento
          `CREATE INDEX IF NOT EXISTS idx_visitas_persona_fecha ON visitas(persona_id, fecha_ingreso, hora_ingreso)`,
          `CREATE INDEX IF NOT EXISTS idx_visitas_area ON visitas(area_id)`,

          // Trigger: al insertar en visitantes, upsert en personas y crear visita
          `DROP TRIGGER IF EXISTS trg_visitantes_ai`,
          `DROP TRIGGER IF EXISTS trg_visitantes_au_salida`,
          `DROP TRIGGER IF EXISTS trg_visitantes_au_area`,

          `CREATE TRIGGER IF NOT EXISTS trg_visitantes_ai
            AFTER INSERT ON visitantes
          BEGIN
            INSERT INTO personas(rut, nombre) VALUES (NEW.rut, NEW.nombre)
              ON CONFLICT(rut) DO UPDATE SET nombre=excluded.nombre;

            INSERT INTO visitas(persona_id, fecha_ingreso, hora_ingreso, area_id)
            VALUES ((SELECT id FROM personas WHERE rut = NEW.rut), NEW.fecha_ingreso, NEW.hora_ingreso, NEW.area_id);

            UPDATE visitantes SET visita_id = last_insert_rowid() WHERE id = NEW.id;
          END`,

          // Trigger: al actualizar salida en visitantes, reflejar en visitas
          `CREATE TRIGGER IF NOT EXISTS trg_visitantes_au_salida
            AFTER UPDATE OF fecha_salida, hora_salida ON visitantes
            WHEN NEW.fecha_salida IS NOT NULL OR NEW.hora_salida IS NOT NULL
          BEGIN
            -- Si tenemos visita_id, actualizamos por id
            UPDATE visitas
              SET fecha_salida = NEW.fecha_salida,
                  hora_salida = NEW.hora_salida
            WHERE id = NEW.visita_id;

            -- Fallback: si no se estableció visita_id, actualizar la última visita abierta de la persona
            UPDATE visitas
              SET fecha_salida = NEW.fecha_salida,
                  hora_salida = NEW.hora_salida
            WHERE id IN (
              SELECT v.id FROM visitas v
              JOIN personas p ON p.id = v.persona_id
              WHERE p.rut = NEW.rut AND v.fecha_salida IS NULL
              ORDER BY v.id DESC LIMIT 1
            );
          END`,

          // Trigger: si cambia el área del visitante mientras la visita está abierta, reflejarlo
          `CREATE TRIGGER IF NOT EXISTS trg_visitantes_au_area
            AFTER UPDATE OF area_id ON visitantes
            WHEN NEW.area_id IS NOT OLD.area_id
          BEGIN
            UPDATE visitas
              SET area_id = NEW.area_id
            WHERE id = NEW.visita_id;
          END`,
        ];

        const runStatement = (idx = 0) => {
          if (idx >= statements.length) {
            // Backfill de datos existentes de visitantes hacia el nuevo esquema
            this.#backfillFromVisitantes()
              .then(resolve)
              .catch(reject);
            return;
          }

          this.db.run(statements[idx], (err) => {
            if (err) {
              const msg = String(err && err.message ? err.message : err);
              // Ignorar errores esperados por idempotencia
              if (
                msg.includes('duplicate column name') ||
                msg.includes('already exists')
              ) {
                // Continuar con el siguiente statement
                runStatement(idx + 1);
              } else {
                console.error('Error al ejecutar migración SQL:', msg);
                reject(err);
              }
            } else {
              runStatement(idx + 1);
            }
          });
        };

        runStatement(0);
      });
    });
  }

  // Migra registros existentes de la tabla legacy a las nuevas tablas en caso de que aún no se hayan sincronizado
  #backfillFromVisitantes() {
    return new Promise((resolve, reject) => {
      const selectSql = `SELECT * FROM visitantes WHERE visita_id IS NULL`;
      this.db.all(selectSql, (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve();

        this.db.serialize(() => {
          const upsertPersona = this.db.prepare(
            `INSERT INTO personas(rut, nombre) VALUES (?, ?)
             ON CONFLICT(rut) DO UPDATE SET nombre=excluded.nombre`
          );
          const insertVisita = this.db.prepare(
            `INSERT INTO visitas(persona_id, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, area_id)
             VALUES ((SELECT id FROM personas WHERE rut = ?), ?, ?, ?, ?, ?)`
          );
          const updateVisitante = this.db.prepare(
            `UPDATE visitantes SET visita_id = (SELECT id FROM visitas WHERE persona_id = (SELECT id FROM personas WHERE rut = ?) AND fecha_ingreso = ? AND hora_ingreso = ? ORDER BY id DESC LIMIT 1)
             WHERE id = ?`
          );

          for (const r of rows) {
            upsertPersona.run([r.rut, r.nombre]);
            insertVisita.run([r.rut, r.fecha_ingreso, r.hora_ingreso, r.fecha_salida || null, r.hora_salida || null, r.area_id || null]);
            updateVisitante.run([r.rut, r.fecha_ingreso, r.hora_ingreso, r.id]);
          }

          upsertPersona.finalize();
          insertVisita.finalize();
          updateVisitante.finalize((finalizeErr) => {
            if (finalizeErr) return reject(finalizeErr);
            console.log(`Migración: sincronizados ${rows.length} registros legacy a esquema nuevo.`);
            resolve();
          });
        });
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