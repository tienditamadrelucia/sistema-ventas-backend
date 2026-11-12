export function paginaRegularizacionStock(token, usuarioId) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Regularización de stock — Tiendita</title>

<style>
body {
  margin: 0;
  padding: 22px;
  background: white;
  font-family: "Times New Roman", serif;
  color: #222;
}

main { max-width: 1250px; margin: auto; }
h1 { text-align: center; font-size: 27px; }

header {
  background: #F9CEAE;
  padding: 12px;
  font-size: 22px;
  font-weight: bold;
  text-align: center;
}

.panel {
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 16px;
  margin: 18px 0;
}

.boton {
  font: bold 14px Arial, sans-serif;
  background: #84B09C;
  color: white;
  border: 1px solid #ccc;
  border-radius: 7px;
  padding: 11px 18px;
  cursor: pointer;
  margin: 5px;
}

.boton:disabled { opacity: .55; cursor: wait; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #bbb; padding: 8px; }
th { background: #F9CEAE; }
.negativo { color: #a52525; font-weight: bold; }

.aviso {
  white-space: pre-wrap;
  padding: 12px;
  background: #fff8e6;
  border: 1px solid #e2c58d;
}

.bien { background: #eef7ef; border-color: #96b79e; }
.tabla { max-height: 480px; overflow: auto; }
.fila { display: flex; flex-wrap: wrap; gap: 20px; }
label { display: block; margin: 12px 0; }
#mensaje:empty { display: none; }
</style>
</head>

<body>
<main>
  <header>SistemaVentas · TIENDITA</header>

  <h1>REGULARIZACIÓN DE APERTURA DE NOVIEMBRE</h1>

  <div class="panel">
    <div class="fila">
      <strong>Período de origen: octubre de 2026</strong>
      <strong>Apertura: 01/11/2026</strong>
    </div>

    <p>
      La apertura se calcula desde el inventario físico del 01/10.
      Se conservará un respaldo del stock anterior y del cálculo
      de cada producto.
    </p>

    <p>
      Los productos sin conteo respaldado conservan su stock.
      Los saldos negativos se conservan y se avisarán al registrar
      ventas. Las ventas a crédito son productos en elaboración:
      no descuentan mercancía hasta su entrega.
    </p>

    <button id="consultar" class="boton">
      CONSULTAR VISTA PREVIA
    </button>
  </div>

  <div id="mensaje" role="status" class="aviso"></div>
  <div id="resumen" class="panel" hidden></div>

  <div id="tabla" class="tabla" hidden>
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Producto</th>
          <th>Inicial octubre</th>
          <th>Entradas</th>
          <th>Salidas</th>
          <th>Ventas entregadas</th>
          <th>Apartados</th>
          <th>Inicial noviembre</th>
        </tr>
      </thead>

      <tbody id="filas"></tbody>
    </table>
  </div>

  <div id="confirmacion" class="panel" hidden>
    <label>
      <input type="checkbox" id="pendientes">
      Comprendo que los productos sin conteo quedan pendientes
      y conservan su stock.
    </label>

    <label>
      <input type="checkbox" id="negativos">
      Conservar los saldos negativos y permitir registrar
      ventas con alerta.
    </label>

    <button id="aplicar" class="boton">
      APLICAR APERTURAS RESPALDADAS
    </button>
  </div>

  <div style="text-align:center">
    <button
      class="boton"
      style="background:#FC9E9B"
      id="volver"
    >
      VOLVER AL MENÚ
    </button>
  </div>
</main>

<script>
const token = ${JSON.stringify(token)};
const usuario = ${JSON.stringify(String(usuarioId))};

const base = '/api/cierre-inventario/regularizacion-stock';
const clave = 'regularizacionStockOctubre:' + usuario;

let plan = null;
let ocupado = false;

const el = id => document.getElementById(id);

const escapar = valor => String(valor ?? '').replace(
  /[&<>"']/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c])
);

const numero = valor => Number(valor || 0).toLocaleString(
  'es-VE',
  { maximumFractionDigits: 3 }
);

function mensaje(texto, bien = false) {
  el('mensaje').textContent = texto;
  el('mensaje').className = 'aviso' + (bien ? ' bien' : '');
}

function bloquear(valor) {
  ocupado = valor;
  el('aplicar').disabled = valor;
  el('consultar').disabled = valor;
}

async function pedir(url, opciones = {}) {
  const res = await fetch(url, {
    ...opciones,
    credentials: 'include'
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    const e = new Error(
      data?.mensaje ||
      data?.error ||
      'No se pudo confirmar la solicitud.'
    );

    e.status = res.status;
    throw e;
  }

  return data;
}

function mostrarResultado(data) {
  sessionStorage.removeItem(clave);

  el('confirmacion').hidden = true;
  el('tabla').hidden = true;
  el('resumen').hidden = false;

  el('resumen').textContent =
    'Productos actualizados: ' + data.productosActualizados +
    '. Pendientes: ' + data.productosPendientes +
    '. Apertura de huevos: ' + data.huevos +
    ' cartones. No se ha declarado un cierre completo ' +
    'de todos los productos.';

  mensaje(data.mensaje, true);
}

async function consultar() {
  if (ocupado) return;

  bloquear(true);

  try {
    const data = await pedir(base + '/vista-previa');

    if (data.yaAplicado || data.aplicada) {
      mostrarResultado(data);
      return;
    }

    plan = data;
    el('resumen').hidden = false;

    el('resumen').textContent =
      'Productos respaldados: ' + plan.aperturas.length +
      ' · Sin conteo: ' + plan.pendientes.length +
      ' · Saldos negativos: ' + plan.negativos.length +
      ' · Unidades apartadas sin entrega: ' +
      plan.apartados.reduce((s, f) => s + f.cantidad, 0);

    el('filas').innerHTML = plan.aperturas.map(f =>
      '<tr>' +
      '<td>' + escapar(f.codigo) + '</td>' +
      '<td>' + escapar(f.descripcion) + '</td>' +
      '<td>' + numero(f.stockInicial) + '</td>' +
      '<td>' + numero(f.entradas) + '</td>' +
      '<td>' + numero(f.salidas) + '</td>' +
      '<td>' + numero(f.ventasContado) + '</td>' +
      '<td>' + numero(f.apartadosSinEntrega || 0) + '</td>' +
      '<td class="' + (f.stockFinal < 0 ? 'negativo' : '') + '">' +
      numero(f.stockFinal) + '</td>' +
      '</tr>'
    ).join('');

    el('tabla').hidden = false;
    el('confirmacion').hidden = false;

    mensaje(plan.mensaje);

    if (sessionStorage.getItem(clave)) {
      el('aplicar').textContent = 'REINTENTAR LA MISMA OPERACIÓN';

      mensaje(
        'Hay una operación pendiente de confirmar. ' +
        'El reintento conserva sus datos.'
      );
    }
  } catch (e) {
    mensaje(e.message);
  } finally {
    bloquear(false);
  }
}

async function aplicar() {
  if (ocupado || !plan) return;

  let datos;
  const guardado = sessionStorage.getItem(clave);

  if (guardado) {
    datos = JSON.parse(guardado);
  } else {
    if (
      !el('pendientes').checked ||
      !el('negativos').checked
    ) {
      mensaje(
        'Marque las dos confirmaciones después de revisar ' +
        'la vista previa.'
      );

      return;
    }

    if (!confirm(
      'Se actualizará el stock inicial de ' +
      plan.aperturas.length +
      ' productos para noviembre. ' +
      'Se conservará un respaldo. ¿Aplicar?'
    )) {
      return;
    }

    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);

    datos = {
      confirmar: true,
      aceptarPendientes: true,
      aceptarNegativos: true,
      firmaPlan: plan.firmaPlan,

      claveOperacion: Array.from(
        bytes,
        b => b.toString(16).padStart(2, '0')
      ).join('')
    };

    try {
      sessionStorage.setItem(
        clave,
        JSON.stringify(datos)
      );
    } catch {
      mensaje(
        'No se pudo conservar la solicitud. ' +
        'No se enviaron cambios.'
      );

      return;
    }
  }

  bloquear(true);

  mensaje(
    'Procesando la regularización. Espere la confirmación...'
  );

  try {
    const data = await pedir(base + '/aplicar', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'X-Token-Regularizacion': token
      },

      body: JSON.stringify(datos)
    });

    mostrarResultado(data);
  } catch (e) {
    if ([400, 401, 403, 409].includes(e.status)) {
      sessionStorage.removeItem(clave);

      el('aplicar').textContent =
        'APLICAR APERTURAS RESPALDADAS';
    } else {
      el('aplicar').textContent =
        'REINTENTAR LA MISMA OPERACIÓN';
    }

    mensaje(e.message);
  } finally {
    bloquear(false);
  }
}

el('consultar').onclick = consultar;
el('aplicar').onclick = aplicar;

el('volver').onclick = () => {
  location.href =
    'https://sistema-ventas-frontend-tan.vercel.app/menu';
};

consultar();
</script>
</body>
</html>`;
}