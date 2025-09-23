function errorHandler(err, req, res, next) {
  console.error('Error:', err);


  // Error de validación
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Error de validación',
      details: err.message
    });
  }


  // Error de base de datos
  if (err.code && err.code.startsWith('SQLITE_')) {
    return res.status(500).json({
      error: 'Error de base de datos',
      details: 'Error interno del servidor'
    });
  }


  // Error general
  res.status(err.status || 500).json({
    error: 'Error interno del servidor',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Contacte al administrador'
  });
}


function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    message: `La ruta ${req.method} ${req.path} no existe`
  });
}


module.exports = {
  errorHandler,
  notFoundHandler
};
