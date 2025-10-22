# Visita Segura

## Esquema de base de datos (compatibilidad + modelo robusto)

La app mantiene la tabla existente `visitantes` para no romper el código ni las APIs actuales. Además, se añadieron tablas normalizadas para un historial más robusto:

- `personas(id, rut UNIQUE, nombre, created_at)`
- `visitas(id, persona_id FK personas(id), fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, created_at)`
- `areas(id, nombre UNIQUE, descripcion)` (opcional, aún sin uso en la app)
 - `areas(id, nombre UNIQUE, descripcion)` (opcional)
 - Enlace opcional de área: `visitantes.area_id` y `visitas.area_id` apuntan a `areas.id`.

Se crearon triggers para sincronizar automáticamente:

- Al insertar en `visitantes` se hace upsert en `personas` y se inserta una fila en `visitas`.
- Al actualizar la salida en `visitantes`, se actualiza la fila correspondiente en `visitas`.

De esta forma, la aplicación actual sigue funcionando igual (misma API y UI), mientras que el historial completo queda almacenado en `visitas` + `personas` para reportes más avanzados.

Notas:

- La exportación CSV diaria y manual sigue usando `visitantes` y no cambia sus columnas.
- Al generar el reporte, sólo se vacía `visitantes`; el historial en `visitas` se conserva.

## API: uso de área opcional en ingreso

El endpoint `POST /api/ingreso` ahora acepta opcionalmente:

- `area_id`: id numérico existente en la tabla `areas`.
- `area`: nombre de área (si no existe, se crea automáticamente).

Ejemplos de body JSON:

```
{ "rut": "12345678-9", "nombre": "Ana" }
{ "rut": "12345678-9", "nombre": "Ana", "area": "Recepción" }
{ "rut": "12345678-9", "nombre": "Ana", "area_id": 1 }
```

## Consultas útiles (SQLite)

- Últimas visitas con datos de persona:

```
SELECT p.rut, p.nombre, v.fecha_ingreso, v.hora_ingreso, v.fecha_salida, v.hora_salida
FROM visitas v JOIN personas p ON p.id = v.persona_id
ORDER BY v.id DESC LIMIT 100;
```

## Desarrollo

- Backend: Node.js + Express + sqlite3
- Escritorio: Electron

