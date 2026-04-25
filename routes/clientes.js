import express from "express";
import Cliente from "../models/Cliente.js"; // Asegúrate que esta ruta sea la correcta

const router = express.Router();

// 🟢 CREAR CLIENTE
router.post("/", async (req, res) => {
  try {    
    const { identificacion } = req.body;
    const existe = await Cliente.findOne({ identificacion });    
    if (existe) {
      return res.status(400).json({
        ok: false,
        error: "La identificación ya está registrada"
      });
    }
    const nuevo = new Cliente(req.body);
    const guardado = await nuevo.save();
    res.json({ ok: true, id: guardado._id });
  } catch (error) {
    console.error("Error guardando cliente:", error);
    res.status(500).json({ ok: false, error: "Error guardando cliente" });
  }
});

// 🟢 TODOS LOS CLIENTES
router.get("/todos", async (req, res) => {  
     try {
       const clientes = await Cliente.find(); // SIN LIMIT
       res.json(clientes);
     } catch (error) {
       console.error("Error consultando todos los clientes:", error);
       res.status(500).json({ ok: false, error: "Error consultando clientes" });
     }
   });

// 🟢 LISTAR CLIENTES CON PAGINACIÓN
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const total = await Cliente.countDocuments();
    const clientes = await Cliente.find()
      .sort({ nombreCompleto: 1 })
      .skip(skip)
      .limit(limit);    
    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      clientes
    });
  } catch (error) {
    console.error("Error listando clientes:", error);
    res.status(500).json({ ok: false, error: "Error listando clientes" });
  }
});

// 🟢 BUSCAR CLIENTE POR IDENTIFICACIÓN
router.get("/cedula/:cedula", async (req, res) => {  
  const cedula = req.params.cedula;
  try {
    const cliente = await Cliente.findOne({ identificacion: cedula }).lean();    
    if (!cliente) {      
      return res.status(404).json({ ok: false, error: "Cliente no encontrado" });
    }    
    return res.json({ ok: true, cliente });
  } catch (error) {    
    return res.status(500).json({ ok: false, error: "Error consultando cliente" });
  }
});

// 🟢 ACTUALIZAR CLIENTE
router.put("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const cambios = req.body;
    const { identificacion } = cambios;    
    if (identificacion) {
      const existe = await Cliente.findOne({
        identificacion,
        _id: { $ne: id }
      });      
      if (existe) {
        return res.status(400).json({
          ok: false,
          error: "La identificación ya está registrada por otro cliente"
        });
      }
    }    
    const actualizado = await Cliente.findByIdAndUpdate(
      id,
      { $set: cambios },
      { new: true }
    );    
    if (!actualizado) {
      return res.status(404).json({ ok: false, error: "Cliente no encontrado" });
    }    
    res.json({ ok: true, cliente: actualizado });
  } catch (error) {
    console.error("Error actualizando cliente:", error);
    res.status(500).json({ ok: false, error: "Error actualizando cliente" });
  }
});

// 🟢 ELIMINAR CLIENTE
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ ok: false, error: "ID no proporcionado" });
    }
    const cliente = await Cliente.findById(id);
    if (!cliente) {
      return res.status(404).json({ ok: false, error: "Cliente no encontrado" });
    }

    // 🔴 VALIDAR SI TIENE VENTAS ASOCIADAS
    const ventas = await Venta.find({ clienteId: id });
    if (ventas.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "No se puede eliminar el cliente porque tiene ventas asociadas"
      });
    }

    // 🟢 SI NO TIENE VENTAS → ELIMINAR
    await Cliente.findByIdAndDelete(id);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error eliminando cliente:", error);
    res.status(500).json({ ok: false, error: "Error eliminando cliente" });
  }
});


export default router;