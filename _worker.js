// _worker.js — Tienda Welux (Pages, modo avanzado; clon de La Mesita, 09/11/2026)
// Solo intercepta /api/* (ver _routes.json); el resto lo sirve Pages como
// archivos estaticos. POST /api/checkout crea la sesion de Stripe Checkout
// con los precios del catalogo publicado (el navegador nunca pone precios):
//   200 { url, id }                       -> el cliente paga en Stripe
//   422 { error: 'sin_precio', ids }      -> la web deriva al respaldo
//   503 { error: 'pagos_no_configurados' }-> falta STRIPE_SECRET_KEY (mismo respaldo)
//   400 carrito vacio / producto desconocido - 502 error de Stripe
//
// ESTADO: sin configurar. No hay ninguna clave Stripe en este código ni en
// este proyecto. El dueño pondrá STRIPE_SECRET_KEY (cuenta Stripe de Welux)
// en el proyecto de Pages cuando decida activar el cobro. Sin ese secreto,
// /api/checkout responde 503 y la web deriva el pedido a WhatsApp (si el
// número está configurado en app.js) o a correo (info@weluxhub.com).
// Moneda: EUR. No hay modo live ni test activo aquí: nada cobra de verdad.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
    return env.ASSETS.fetch(request);
  },
};
