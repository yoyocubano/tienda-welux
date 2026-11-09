// _worker.js — Tienda Welux (Pages, modo avanzado; clon de La Mesita, 09/11/2026)
// Solo intercepta /api/* (ver _routes.json); el resto lo sirve Pages como
// archivos estaticos.
//
// Endpoints:
//   POST /api/checkout  crea la sesion de Stripe Checkout con los precios
//     del catalogo publicado (el navegador nunca pone precios):
//     200 { url, id }                       -> el cliente paga en Stripe
//     422 { error: 'sin_precio', ids }      -> la web deriva al respaldo
//     503 { error: 'pagos_no_configurados' }-> falta STRIPE_SECRET_KEY (mismo respaldo)
//     400 carrito vacio / producto desconocido - 502 error de Stripe
//   GET  /api/productos  sirve el catalogo publicado (productos.json).
//   POST /api/pedido     recibe un pedido y lo guarda (KV PEDIDOS, si existe
//     el binding) y/o lo envia por correo a info@weluxhub.com y
//     stayarista@gmail.com por Resend (si existe RESEND_API_KEY). Sin
//     ninguno de los dos responde 503 { error: 'pedido_no_configurado' } y
//     la web deriva al respaldo mailto de siempre: ningun pedido se pierde.
//   GET  /api/bigbuy/status  estado del conector BigBuy (preparado, sin
//     cuenta todavia): 503 { error: 'bigbuy_no_configurado' } mientras no
//     exista BIGBUY_API_KEY. Base por defecto: el sandbox de BigBuy
//     (https://api.sandbox.bigbuy.eu). La clave nunca se devuelve.
//
// ESTADO (09/11/2026): sin configurar. No hay ninguna clave Stripe, ni de
// BigBuy, ni de Resend en este codigo ni en este proyecto. El dueño pondra
// STRIPE_SECRET_KEY (cuenta Stripe de Welux) en el proyecto de Pages cuando
// decida activar el cobro — los pagos son LO ULTIMO, no se conectan ahora.
// Sin ese secreto, /api/checkout responde 503 y la web deriva el pedido a
// WhatsApp (si el numero esta configurado en app.js) o a correo
// (info@weluxhub.com). Moneda: EUR. No hay modo live ni test activo aqui:
// nada cobra de verdad.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function cargarCatalogo(request, env) {
  const catRes = await env.ASSETS.fetch(new URL("/productos.json", request.url));
  if (!catRes.ok) throw new Error("catalogo " + catRes.status);
  const cj = await catRes.json();
  return Array.isArray(cj) ? cj : (cj.productos || []);
}

async function handleProductos(request, env) {
  try {
    const catalogo = await cargarCatalogo(request, env);
    return json({ productos: catalogo });
  } catch {
    return json({ error: "catalogo_no_disponible" }, 500);
  }
}

async function enviarPedidoResend(env, pedido) {
  const lineas = pedido.items
    .map((i) => `- ${i.cantidad} x ${i.nombre} (${i.unidad})`)
    .join("\n");
  const texto =
    `Nuevo pedido Tienda Welux ${pedido.numero}\n\n${lineas}\n\n` +
    `Total: ${pedido.total}\n` +
    (pedido.nombre ? `Cliente: ${pedido.nombre}\n` : "") +
    (pedido.telefono ? `Telefono: ${pedido.telefono}\n` : "") +
    (pedido.email ? `Email: ${pedido.email}\n` : "") +
    `\nFecha: ${pedido.fecha}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tienda Welux <pedidos@weluxhub.com>",
      to: ["info@weluxhub.com", "stayarista@gmail.com"],
      subject: `Pedido Tienda Welux ${pedido.numero}`,
      text: texto,
    }),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error("resend " + res.status + " " + detalle.slice(0, 200));
  }
  return await res.json().catch(() => ({}));
}

async function handlePedido(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "json_invalido" }, 400);
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return json({ error: "carrito_vacio" }, 400);

  let catalogo;
  try {
    catalogo = await cargarCatalogo(request, env);
  } catch {
    return json({ error: "catalogo_no_disponible" }, 500);
  }
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const lineas = [];
  let sinPrecio = false;
  for (const it of items) {
    const prod = porId.get(it?.id);
    if (!prod) return json({ error: "producto_desconocido", id: it?.id ?? null }, 400);
    const qty = Math.max(1, Math.min(99, parseInt(it.cantidad, 10) || 1));
    if (prod.precio_minorista == null) sinPrecio = true;
    lineas.push({ id: prod.id, nombre: prod.nombre, unidad: prod.unidad, cantidad: qty, precio_minorista: prod.precio_minorista });
  }
  const numero = "WLX-" + Date.now().toString(36).toUpperCase();
  const pedido = {
    numero,
    fecha: new Date().toISOString(),
    items: lineas,
    total: sinPrecio ? "a confirmar" : "confirmado",
    nombre: typeof body?.nombre === "string" ? body.nombre.slice(0, 120) : null,
    telefono: typeof body?.telefono === "string" ? body.telefono.slice(0, 40) : null,
    email: typeof body?.email === "string" ? body.email.slice(0, 120) : null,
  };

  const vias = [];
  if (env.PEDIDOS) {
    try {
      await env.PEDIDOS.put("pedido:" + numero, JSON.stringify(pedido));
      vias.push("kv");
    } catch (e) {
      return json({ error: "pedido_no_guardado", detalle: String(e).slice(0, 200) }, 500);
    }
  }
  if (env.RESEND_API_KEY) {
    try {
      await enviarPedidoResend(env, pedido);
      vias.push("email");
    } catch (e) {
      // El pedido ya esta guardado en KV si existe; si no hay KV, no se
      // puede confirmar el envio: devolver 502 para que la web use mailto.
      if (!vias.includes("kv")) {
        return json({ error: "pedido_no_enviado", detalle: String(e).slice(0, 200) }, 502);
      }
    }
  }
  if (!vias.length) return json({ error: "pedido_no_configurado" }, 503);
  return json({ ok: true, numero, via: vias.join("+") });
}

function handleBigbuyStatus(request, env) {
  const base = env.BIGBUY_API_BASE || "https://api.sandbox.bigbuy.eu";
  if (!env.BIGBUY_API_KEY) {
    return json({ error: "bigbuy_no_configurado", base, nota: "Conector preparado. Falta BIGBUY_API_KEY (no hay cuenta BigBuy todavia; el alta espera al nº TVA, ~23/11/2026)." }, 503);
  }
  return json({ ok: true, base, nota: "BIGBUY_API_KEY configurada. Endpoints previstos: catalogo, stock, pedidos y tracking contra la API REST de BigBuy." });
}

async function handleCheckout(request, env) {

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "json_invalido" }, 400);
  }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return json({ error: "carrito_vacio" }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "pagos_no_configurados" }, 503);

  // Catálogo autoritativo servido por este mismo proyecto
  let catalogo;
  try {
    const catRes = await env.ASSETS.fetch(new URL("/productos.json", request.url));
    if (!catRes.ok) throw new Error("catalogo " + catRes.status);
    const _cj = await catRes.json(); catalogo = Array.isArray(_cj) ? _cj : (_cj.productos || []);
  } catch {
    return json({ error: "catalogo_no_disponible" }, 500);
  }
  const porId = new Map(catalogo.map((p) => [p.id, p]));

  const lineItems = [];
  const sinPrecio = [];
  const resumen = [];
  for (const it of items) {
    const prod = porId.get(it?.id);
    if (!prod) return json({ error: "producto_desconocido", id: it?.id ?? null }, 400);
    const qty = Math.max(1, Math.min(99, parseInt(it.cantidad, 10) || 1));
    if (prod.precio_minorista == null) {
      sinPrecio.push(prod.id);
      continue;
    }
    lineItems.push({ prod, qty });
    resumen.push(`${qty} x ${prod.nombre}`);
  }
  if (sinPrecio.length) return json({ error: "sin_precio", ids: sinPrecio }, 422);
  if (!lineItems.length) return json({ error: "carrito_vacio" }, 400);

  const origin = new URL(request.url).origin;
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${origin}/gracias.html?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/?pago=cancelado`);
  form.set("metadata[origen]", "welux-tienda-web");
  form.set("metadata[pedido]", resumen.join(", ").slice(0, 480));
  // Nombre y teléfono del cliente para coordinar la entrega en Luxemburgo
  form.set("custom_fields[0][key]", "nombre");
  form.set("custom_fields[0][label][type]", "custom");
  form.set("custom_fields[0][label][custom]", "Tu nombre");
  form.set("custom_fields[0][type]", "text");
  form.set("custom_fields[1][key]", "telefono");
  form.set("custom_fields[1][label][type]", "custom");
  form.set("custom_fields[1][label][custom]", "Tu teléfono (para coordinar la entrega)");
  form.set("custom_fields[1][type]", "text");

  lineItems.forEach((li, i) => {
    form.set(`line_items[${i}][quantity]`, String(li.qty));
    form.set(`line_items[${i}][price_data][currency]`, "eur");
    form.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(li.prod.precio_minorista * 100)));
    form.set(`line_items[${i}][price_data][product_data][name]`, li.prod.nombre);
    if (li.prod.unidad) {
      form.set(`line_items[${i}][price_data][product_data][description]`, li.prod.unidad);
    }
  });

  const apiBase = env.STRIPE_API_BASE || "https://api.stripe.com";
  let session;
  try {
    const stripeRes = await fetch(`${apiBase}/v1/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    session = await stripeRes.json();
    if (!stripeRes.ok) {
      return json(
        { error: "stripe_error", detalle: session?.error?.message || "desconocido" },
        502
      );
    }
  } catch {
    return json({ error: "stripe_inaccesible" }, 502);
  }
  return json({ url: session.url, id: session.id });
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/checkout") {
      if (request.method === "POST") return handleCheckout(request, env);
      return json({ error: "usa POST" }, 405);
    }
    if (url.pathname === "/api/productos") {
      if (request.method === "GET") return handleProductos(request, env);
      return json({ error: "usa GET" }, 405);
    }
    if (url.pathname === "/api/pedido") {
      if (request.method === "POST") return handlePedido(request, env);
      return json({ error: "usa POST" }, 405);
    }
    if (url.pathname === "/api/bigbuy/status") {
      if (request.method === "GET") return handleBigbuyStatus(request, env);
      return json({ error: "usa GET" }, 405);
    }
    return env.ASSETS.fetch(request);
  },
};
