const express = require('express');
const visitantesController = require('../controllers/visitantesController');


const router = express.Router();


// Rutas para visitantes
router.post('/ingreso', visitantesController.registrarIngreso);
router.post('/salida', visitantesController.registrarSalida);
router.get('/visitas', visitantesController.obtenerVisitas);
router.get('/visitante/:rut', visitantesController.obtenerVisitante);


module.exports = router;
