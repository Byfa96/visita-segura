const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');


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
     
        this.db.run('PRAGMA foreign_keys = ON');

        const statements = [
          // Renombrar tabla legacy
          `ALTER TABLE visitantes RENAME TO visitantes_legacy`,

        
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
            fecha_ingreso TEXT,
            hora_ingreso TEXT,
            fecha_salida TEXT,
            hora_salida TEXT,
            area_id INTEGER,
            estado TEXT,
            registrado_por TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (persona_id) REFERENCES personas(id),
            FOREIGN KEY (area_id) REFERENCES areas(id)
          )`,

          // Columnas nuevas e índices
          `ALTER TABLE visitas ADD COLUMN area_id INTEGER`,
          `ALTER TABLE visitas ADD COLUMN estado TEXT`,
          `ALTER TABLE visitas ADD COLUMN registrado_por TEXT`,
          `ALTER TABLE visitas ADD COLUMN estado_id INTEGER`,
          `ALTER TABLE visitas ADD COLUMN usuario_registro_id INTEGER`,
          `ALTER TABLE visitas ADD COLUMN ingreso_ts TEXT`,
          `ALTER TABLE visitas ADD COLUMN salida_ts TEXT`,
          `CREATE INDEX IF NOT EXISTS idx_visitas_persona_fecha ON visitas(persona_id, fecha_ingreso, hora_ingreso)`,
          `CREATE INDEX IF NOT EXISTS idx_visitas_area ON visitas(area_id)`,
          `CREATE INDEX IF NOT EXISTS idx_visitas_estado ON visitas(estado_id)`,
          `CREATE INDEX IF NOT EXISTS idx_visitas_usuario_registro ON visitas(usuario_registro_id)`,

          // Catálogos
          `CREATE TABLE IF NOT EXISTS estados_visita (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT NOT NULL UNIQUE,
            descripcion TEXT
          )`,
          `CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT,
            origen TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,
          `INSERT OR IGNORE INTO estados_visita(codigo, descripcion) VALUES
            ('activo','Visita activa'),
            ('completado','Visita completada'),
            ('expirado','Visita expirada')`,

   
          `DROP TRIGGER IF EXISTS trg_visitas_ai_normalize`,
          `DROP TRIGGER IF EXISTS trg_visitas_au_estado`,
          `DROP TRIGGER IF EXISTS trg_visitas_au_registrado`,
          `CREATE TRIGGER IF NOT EXISTS trg_visitas_ai_normalize
            AFTER INSERT ON visitas
          BEGIN
            UPDATE visitas SET estado_id = (
              SELECT id FROM estados_visita WHERE codigo = NEW.estado
            ) WHERE id = NEW.id AND NEW.estado IS NOT NULL;
            INSERT OR IGNORE INTO usuarios(username, display_name, origen)
              VALUES (NEW.registrado_por, NEW.registrado_por, 'sistema');
            UPDATE visitas SET usuario_registro_id = (
              SELECT id FROM usuarios WHERE username = NEW.registrado_por
            ) WHERE id = NEW.id AND NEW.registrado_por IS NOT NULL;
          END`,
          `CREATE TRIGGER IF NOT EXISTS trg_visitas_au_estado
            AFTER UPDATE OF estado ON visitas
            WHEN NEW.estado IS NOT OLD.estado
          BEGIN
            UPDATE visitas SET estado_id = (
              SELECT id FROM estados_visita WHERE codigo = NEW.estado
            ) WHERE id = NEW.id;
          END`,
          `CREATE TRIGGER IF NOT EXISTS trg_visitas_au_registrado
            AFTER UPDATE OF registrado_por ON visitas
            WHEN NEW.registrado_por IS NOT OLD.registrado_por
          BEGIN
            INSERT OR IGNORE INTO usuarios(username, display_name, origen)
              VALUES (NEW.registrado_por, NEW.registrado_por, 'sistema');
            UPDATE visitas SET usuario_registro_id = (
              SELECT id FROM usuarios WHERE username = NEW.registrado_por
            ) WHERE id = NEW.id;
          END`,

          // View de compatibilidad
          `CREATE VIEW IF NOT EXISTS visitantes AS
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
              v.id AS visita_id,
              v.area_id AS area_id,
              v.estado AS estado
            FROM visitas v
            JOIN personas p ON p.id = v.persona_id`
        ];

        const runStatement = (idx = 0) => {
          if (idx >= statements.length) {
          
            this.#migrateLegacyVisitantes()
              .then(() => this.#backfillNormalization())
              .then(resolve)
              .catch(reject);
            return;
          }

          this.db.run(statements[idx], (err) => {
            if (err) {
              const msg = String(err && err.message ? err.message : err);
   
              if (
                msg.includes('duplicate column name') ||
                msg.includes('already exists') ||
                msg.includes('no such table: visitantes') ||
                msg.includes('view visitantes may not be altered')
              ) {
              
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


  #migrateLegacyVisitantes() {
    return new Promise((resolve) => {

      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='visitantes_legacy'", (err, row) => {
        if (err || !row) return resolve(); 
        this.db.all("SELECT rut, nombre, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, area_id, estado, registrado_por FROM visitantes_legacy", (selErr, rows) => {
          if (selErr || !rows || rows.length === 0) return resolve();
          this.db.serialize(() => {
            const upsertPersona = this.db.prepare("INSERT INTO personas(rut, nombre) VALUES (?, ?) ON CONFLICT(rut) DO UPDATE SET nombre=excluded.nombre");
            const insertVisita = this.db.prepare("INSERT INTO visitas(persona_id, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, area_id, estado, registrado_por) VALUES ((SELECT id FROM personas WHERE rut = ?), ?, ?, ?, ?, ?, ?, ?)");
            for (const r of rows) {
              upsertPersona.run([r.rut, r.nombre]);
              insertVisita.run([r.rut, r.fecha_ingreso, r.hora_ingreso, r.fecha_salida || null, r.hora_salida || null, r.area_id || null, r.estado || 'activo', r.registrado_por || null]);
            }
            upsertPersona.finalize();
            insertVisita.finalize(() => {
              console.log(`Migración legacy: ${rows.length} registros trasladados a visitas.`);
              resolve();
            });
          });
        });
      });
    });
  }

  #backfillNormalization() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.all(`SELECT DISTINCT estado FROM visitas WHERE estado IS NOT NULL`, (err, estadosRows) => {
          if (err) return reject(err);
          const insertEstado = this.db.prepare(`INSERT OR IGNORE INTO estados_visita(codigo, descripcion) VALUES (?, ?)`);
          for (const r of estadosRows) {
            const codigo = r.estado;
            if (codigo) insertEstado.run([codigo, `Estado ${codigo}`]);
          }
          insertEstado.finalize();

          // Poblar usuarios desde registrado_por
          this.db.all(`SELECT DISTINCT registrado_por FROM visitas WHERE registrado_por IS NOT NULL`, (err2, usuariosRows) => {
            if (err2) return reject(err2);
            const insertUsuario = this.db.prepare(`INSERT OR IGNORE INTO usuarios(username, display_name, origen) VALUES (?, ?, 'sistema')`);
            for (const u of usuariosRows) {
              const user = u.registrado_por;
              if (user) insertUsuario.run([user, user]);
            }
            insertUsuario.finalize();

            this.db.run(`UPDATE visitas SET estado_id = (SELECT id FROM estados_visita WHERE codigo = estado) WHERE estado IS NOT NULL AND estado_id IS NULL`, (e3) => {
              if (e3) return reject(e3);
              this.db.run(`UPDATE visitas SET usuario_registro_id = (SELECT id FROM usuarios WHERE username = registrado_por) WHERE registrado_por IS NOT NULL AND usuario_registro_id IS NULL`, (e4) => {
                if (e4) return reject(e4);

                // Construir timestamps unificados si no existen
                this.db.run(`UPDATE visitas SET ingreso_ts = CASE WHEN ingreso_ts IS NULL THEN fecha_ingreso || 'T' || hora_ingreso ELSE ingreso_ts END`, (e5) => {
                  if (e5) return reject(e5);
                  this.db.run(`UPDATE visitas SET salida_ts = CASE WHEN salida_ts IS NULL AND fecha_salida IS NOT NULL THEN fecha_salida || 'T' || COALESCE(hora_salida,'00:00:00') ELSE salida_ts END`, (e6) => {
                    if (e6) return reject(e6);
                    resolve();
                  });
                });
              });
            });
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