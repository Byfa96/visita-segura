const visitanteModel = require('../models/visitanteModel');


class VisitantesController {
  async registrarIngreso(req, res) {
    try {
  const { rut, nombre, area_id, area } = req.body;


      // Validaciones básicas
      if (!rut || !nombre) {
        return res.status(400).json({
          error: 'Los campos "rut" y "nombre" son obligatorios'
        });
      }

      // Validar área obligatoria (por nombre o id)
      if (!(area_id || (typeof area === 'string' && area.trim().length))) {
        return res.status(400).json({
          error: 'Debe seleccionar un área para la visita'
        });
      }


  const resultado = await visitanteModel.registrarIngreso(rut, nombre, { area_id, area });
      
      res.status(201).json({
        success: true,
        message: 'Ingreso registrado correctamente',
        data: resultado
      });
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({
          error: 'Ya existe un visitante con ese RUT sin salida registrada'
        });
      }


      res.status(500).json({
        error: 'Error interno del servidor',
        details: error.message
      });
    }
  }


  async registrarSalida(req, res) {
    try {
      const { rut } = req.body;


      if (!rut) {
        return res.status(400).json({
          error: 'El campo "rut" es obligatorio'
        });
      }


      const resultado = await visitanteModel.registrarSalida(rut);
      
      res.json({
        success: true,
        message: 'Salida registrada correctamente',
        data: resultado
      });
    } catch (error) {
      if (error.message.includes('No se encontró')) {
        return res.status(404).json({
          error: error.message
        });
      }


      res.status(500).json({
        error: 'Error interno del servidor',
        details: error.message
      });
    }
  }


  async obtenerVisitas(req, res) {
    try {
      const visitas = await visitanteModel.obtenerTodos();
      
      res.json({
        success: true,
        count: visitas.length,
        data: visitas
      });
    } catch (error) {
      res.status(500).json({
        error: 'Error al obtener las visitas',
        details: error.message
      });
    }
  }


  async obtenerVisitante(req, res) {
    try {
      const { rut } = req.params;
      const visitante = await visitanteModel.obtenerPorRut(rut);


      if (!visitante) {
        return res.status(404).json({
          error: 'Visitante no encontrado'
        });
      }


      res.json({
        success: true,
        data: visitante
      });
    } catch (error) {
      res.status(500).json({
        error: 'Error al obtener el visitante',
        details: error.message
      });
    }
  }
}


module.exports = new VisitantesController();
