const express = require('express');
const cors = require('cors');
const database = require('./database/database');
const visitantesRoutes = require('./routes/visitantesRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/api', visitantesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// Manejo de errores
app.use(notFoundHandler);
app.use(errorHandler);

// Inicialización del servidor
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

startServer();

module.exports = app;