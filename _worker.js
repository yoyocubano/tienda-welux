// _worker.js — Tienda Welux (Pages, modo avanzado; clon de La Mesita, 09/11/2026)
// Solo intercepta /api/* (ver _routes.json); el resto lo sirve Pages como
// archivos estaticos — incluidos productos.json e i18n.json (traducciones
// EN/FR/ES/PT cargadas por app.js con fetch('./i18n.json')): no hace falta
// ninguna ruta extra aquí; env.ASSETS.fetch(request) los sirve tal cual.
//
// Endpoints:
//   POST /api/checkout  crea la sesion de Stripe Checkout con los precios
//     del catalogo publicado (el navegador nunca pone precios):
//     200 { url, id }                       -> el cliente paga en Stripe
//     422 { error: 'sin_precio', ids }      -> la web deriva al respaldo
//     503 { error: 'pagos_no_configurados' }-> falta STRIPE_SECRET_KEY (mismo respaldo)
//     400 carrito vacio / producto desconocido - 502 error de Stripe
//   POST /api/revolut-checkout  como /api/checkout pero con Revolut
//     Merchant (Revolut Pay, tarjeta, Apple Pay): 200 { url, id } ->
//     el cliente paga en checkout.revolut.com; 422 sin_precio, 503
//     pagos_no_configurados sin REVOLUT_MERCHANT_SECRET, 400 carrito
//     vacio / producto desconocido, 502 error de Revolut.
//   GET  /api/productos  sirve el catalogo publicado (productos.json).
//   POST /api/pedido     recibe un pedido y lo guarda (KV PEDIDOS, si existe
//     el binding) y/o lo envia por correo a info@weluxhub.com y
//     stayarista@gmail.com por Resend (si existe RESEND_API_KEY). Sin
//     ninguno de los dos responde 503 { error: 'pedido_no_configurado' } y
//     la web deriva al respaldo mailto de siempre: ningun pedido se pierde.
//     Acepta cabecera Idempotency-Key: repetir la misma clave devuelve el
//     numero original sin crear otro pedido ni otro correo (24 h).
//   GET  /api/pago-estado?session_id=... | ?order_id=...
//     verifica el pago en el servidor antes de que gracias.html afirme
//     nada: consulta la sesion de Stripe o la orden de Revolut con el
//     secreto y devuelve { ok, pagado, estado, metodo }. Sin el secreto
//     del metodo pedido responde 503. Nunca afirma un pago sin esto.
//   Limites anti-abuso (auditoria 12/11): rate limit 10/min por IP y ruta
//     en todos los POST /api/* y en /api/pago-estado; cuerpo maximo 64 KB
//     (413 si se pasa); carrito maximo 50 lineas en checkout y 20 en
//     pedido; total maximo 100.000 EUR por pedido. Las cantidades de un
//     mismo producto se agregan antes de limitar (las lineas duplicadas
//     no esquivan el tope de 99 por producto).
//   GET  /api/bigbuy/status  estado del conector BigBuy (preparado, sin
//     cuenta todavia): 503 { error: 'bigbuy_no_configurado' } mientras no
//     exista BIGBUY_API_KEY. Base por defecto: el sandbox de BigBuy
//     (https://api.sandbox.bigbuy.eu). La clave nunca se devuelve.
//
// ESTADO (12/11/2026): sin configurar. No hay ninguna clave Stripe, ni de
// BigBuy, ni de Resend, ni de Revolut Merchant en este codigo ni en este
// proyecto. El dueño pondra STRIPE_SECRET_KEY (cuenta Stripe de Welux) y
// REVOLUT_MERCHANT_SECRET (cuenta Revolut Merchant de Welux) en el proyecto
// de Pages cuando decida activar el cobro — los pagos son LO ULTIMO, no se
// conectan ahora. Sin esos secretos, /api/checkout y /api/revolut-checkout
// responden 503 y la web deriva el pedido a WhatsApp (si el numero esta
// configurado en app.js) o a correo (info@weluxhub.com). Moneda: EUR. No
// hay modo live ni test activo aqui: nada cobra de verdad.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
  });
}

/* Cabeceras de seguridad en todas las respuestas (API y estaticos).
   Las paginas tambien llevan _headers como refuerzo; el worker es la
   garantia porque Pages no siempre parsea ese archivo. */
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/* ---- Limites anti-abuso (auditoria 12/11, hallazgos 4 y 5) ----
   Contador en memoria por IP y ruta (10/min). Es por instancia del
   Worker; como refuerzo, el dueño debe activar una regla de Rate
   Limiting en Cloudflare. Sin CF-Connecting-IP cada peticion usa su
   propio cubo para no compartir el limite entre desconocidos. */
const hits = new Map();
function limited(ip, ruta) {
  const now = Date.now();
  const clave = (ip || "sin-ip-" + crypto.randomUUID()) + "|" + (ruta || "");
  const lista = (hits.get(clave) || []).filter((t) => now - t < 60000);
  lista.push(now);
  hits.set(clave, lista);
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      const frescas = v.filter((t) => now - t < 60000);
      if (frescas.length) hits.set(k, frescas);
      else hits.delete(k);
    }
  }
  return lista.length > 10;
}
function ipDe(request) {
  return request.headers.get("CF-Connecting-IP") || "desconocida";
}

const MAX_BODY_BYTES = 65536; // 64 KB por peticion JSON
const MAX_LINEAS_CARRITO = 50;
const MAX_LINEAS_PEDIDO = 20;
const MAX_TOTAL_MINOR = 10000000; // 100.000 EUR por pedido

/* Lee el cuerpo JSON con tope de tamaño. Devuelve { data } o { error }.
   Sin el tope, un cuerpo gigante se parsea entero en memoria. */
async function leerJsonConTope(request) {
  const len = request.headers.get("content-length");
  if (len !== null && Number(len) > MAX_BODY_BYTES) return { error: "cuerpo_demasiado_grande" };
  let texto;
  try {
    texto = await request.text();
  } catch {
    return { error: "json_invalido" };
  }
  if (texto.length > MAX_BODY_BYTES) return { error: "cuerpo_demasiado_grande" };
  try {
    return { data: JSON.parse(texto) };
  } catch {
    return { error: "json_invalido" };
  }
}

/* Valida un carrito contra el catalogo y agrega cantidades por producto
   (las lineas duplicadas no esquivan el tope de 99 por producto).
   Devuelve { lineas, sinPrecio, totalCentimos } o { error, id }. */
function validarCarrito(items, porId) {
  const porProducto = new Map();
  for (const it of items) {
    const prod = porId.get(it?.id);
    if (!prod) return { error: "producto_desconocido", id: it?.id ?? null };
    const qty = Math.max(1, Math.min(99, parseInt(it.cantidad, 10) || 1));
    const previo = porProducto.get(prod.id);
    if (previo) previo.qty = Math.min(99, previo.qty + qty);
    else porProducto.set(prod.id, { prod, qty });
  }
  const lineas = [];
  const sinPrecio = [];
  let totalCentimos = 0;
  for (const { prod, qty } of porProducto.values()) {
    if (prod.precio_minorista == null) {
      sinPrecio.push(prod.id);
      continue;
    }
    lineas.push({ prod, qty });
    totalCentimos += Math.round(prod.precio_minorista * 100) * qty;
  }
  return { lineas, sinPrecio, totalCentimos };
}

/* Registra un pago verificado en KV (si existe el binding) para que la
   entrega manual consulte el servidor, no una captura de pantalla.
   No bloquea la respuesta si falla. */
async function registrarPagoVerificado(env, metodo, id) {
  if (!env.PEDIDOS) return;
  try {
    await env.PEDIDOS.put(
      `pago:${metodo}:${id}`,
      JSON.stringify({ metodo, id, estado: "paid", verificado_en: new Date().toISOString() }),
      { expirationTtl: 2592000 }
    );
  } catch (e) {
    /* El registro es secundario: la verificacion ya respondio. */
  }
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
    `Total: ${pedido.total}` +
    (pedido.total_minorista_centimos ? ` (${(pedido.total_minorista_centimos / 100).toFixed(2)} EUR en lineas con precio)` : "") + `\n` +
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
  const lectura = await leerJsonConTope(request);
  if (lectura.error) {
    return json({ error: lectura.error }, lectura.error === "cuerpo_demasiado_grande" ? 413 : 400);
  }
  const body = lectura.data;
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return json({ error: "carrito_vacio" }, 400);
  if (items.length > MAX_LINEAS_PEDIDO) return json({ error: "carrito_demasiado_grande" }, 400);

  /* Idempotencia: repetir la misma clave devuelve el numero original sin
     crear otro pedido ni otro correo. La clave la pone la web (un UUID por
     envio); sin KV no se puede deduplicar y se sigue sin ella. */
  const claveBruta = (request.headers.get("Idempotency-Key") || "").trim();
  const claveIdem = /^[A-Za-z0-9._-]{8,128}$/.test(claveBruta) ? claveBruta : null;
  if (claveIdem && env.PEDIDOS) {
    try {
      const previo = await env.PEDIDOS.get("idempotencia:" + claveIdem);
      if (previo) {
        const p = JSON.parse(previo);
        if (p && p.numero) return json({ ok: true, numero: p.numero, via: p.via, duplicado: true });
      }
    } catch (e) {
      /* Si KV falla al leer, se sigue y se intenta crear el pedido. */
    }
  }

  let catalogo;
  try {
    catalogo = await cargarCatalogo(request, env);
  } catch {
    return json({ error: "catalogo_no_disponible" }, 500);
  }
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const lineas = [];
  let sinPrecio = false;
  let totalCentimos = 0;
  for (const it of items) {
    const prod = porId.get(it?.id);
    if (!prod) return json({ error: "producto_desconocido", id: it?.id ?? null }, 400);
    const qty = Math.max(1, Math.min(99, parseInt(it.cantidad, 10) || 1));
    if (prod.precio_minorista == null) sinPrecio = true;
    else totalCentimos += Math.round(prod.precio_minorista * 100) * qty;
    lineas.push({ id: prod.id, nombre: prod.nombre, unidad: prod.unidad, cantidad: qty, precio_minorista: prod.precio_minorista });
  }
  const numero = "WLX-" + Date.now().toString(36).toUpperCase();
  const pedido = {
    numero,
    fecha: new Date().toISOString(),
    items: lineas,
    total: sinPrecio ? "a confirmar" : "confirmado",
    total_minorista_centimos: totalCentimos,
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
  if (claveIdem && env.PEDIDOS) {
    try {
      await env.PEDIDOS.put(
        "idempotencia:" + claveIdem,
        JSON.stringify({ numero, via: vias.join("+") }),
        { expirationTtl: 86400 }
      );
    } catch (e) {
      /* La deduplicacion es secundaria: el pedido ya esta creado. */
    }
  }
  return json({ ok: true, numero, via: vias.join("+") });
}

function handleBigbuyStatus(request, env) {
  const base = env.BIGBUY_API_BASE || "https://api.sandbox.bigbuy.eu";
  if (!env.BIGBUY_API_KEY) {
    return json({ error: "bigbuy_no_configurado", base, nota: "Conector preparado. Falta BIGBUY_API_KEY (no hay cuenta BigBuy todavia; el alta espera al nº TVA, ~23/11/2026)." }, 503);
  }
  return json({ ok: true, base, nota: "BIGBUY_API_KEY configurada. Endpoints previstos: catalogo, stock, pedidos y tracking contra la API REST de BigBuy." });
}

/* La base de la API de Stripe es fija: jamas se toma de env (un env
   malicioso o equivocado redirigiria la clave secreta a otro host). */
const STRIPE_API_BASE = "https://api.stripe.com";

async function handleCheckout(request, env) {
  const lectura = await leerJsonConTope(request);
  if (lectura.error) {
    return json({ error: lectura.error }, lectura.error === "cuerpo_demasiado_grande" ? 413 : 400);
  }
  const body = lectura.data;
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return json({ error: "carrito_vacio" }, 400);
  if (items.length > MAX_LINEAS_CARRITO) return json({ error: "carrito_demasiado_grande" }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "pagos_no_configurados" }, 503);

  let catalogo;
  try {
    catalogo = await cargarCatalogo(request, env);
  } catch {
    return json({ error: "catalogo_no_disponible" }, 500);
  }
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const validado = validarCarrito(items, porId);
  if (validado.error) return json({ error: validado.error, id: validado.id }, 400);
  if (validado.sinPrecio.length) return json({ error: "sin_precio", ids: validado.sinPrecio }, 422);
  if (!validado.lineas.length || !validado.totalCentimos || validado.totalCentimos > MAX_TOTAL_MINOR) {
    return json({ error: "total_no_valido" }, 400);
  }
  const lineItems = validado.lineas;
  const resumen = validado.lineas.map(({ prod, qty }) => `${qty} x ${prod.nombre}`);

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

  const apiBase = STRIPE_API_BASE;
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

// Pago con Revolut Merchant: espejo de handleCheckout con la misma
// validacion del carrito contra el catalogo publicado (producto
// desconocido 400, carrito vacio 400, sin_precio 422). Crea una orden en
// https://merchant.revolut.com/api/orders y devuelve su checkout_url.
// El secreto se lee SOLO de env.REVOLUT_MERCHANT_SECRET: nunca va en
// codigo ni en ningun archivo. Sin el, 503 pagos_no_configurados y la
// web deriva al respaldo (pedido por WhatsApp o correo), igual que con
// Stripe. Tras pagar, Revolut redirige a /gracias.html?revolut=1, que
// vacia la cesta como ya hace hoy.
async function handleRevolutCheckout(request, env) {
  const lectura = await leerJsonConTope(request);
  if (lectura.error) {
    return json({ error: lectura.error }, lectura.error === "cuerpo_demasiado_grande" ? 413 : 400);
  }
  const body = lectura.data;
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return json({ error: "carrito_vacio" }, 400);
  if (items.length > MAX_LINEAS_CARRITO) return json({ error: "carrito_demasiado_grande" }, 400);

  let catalogo;
  try {
    catalogo = await cargarCatalogo(request, env);
  } catch {
    return json({ error: "catalogo_no_disponible" }, 500);
  }
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const validado = validarCarrito(items, porId);
  if (validado.error) return json({ error: validado.error, id: validado.id }, 400);
  if (validado.sinPrecio.length) return json({ error: "sin_precio", ids: validado.sinPrecio }, 422);
  if (!validado.totalCentimos || validado.totalCentimos > MAX_TOTAL_MINOR) return json({ error: "total_no_valido" }, 400);
  const totalCentimos = validado.totalCentimos;
  const resumen = validado.lineas.map(({ prod, qty }) => `${qty} x ${prod.nombre}`);
  // La validación del carrito va antes: un pedido inválido se rechaza
  // aunque el cobro no esté configurado (igual que un 400/422 no depende
  // de la clave). Sin el secreto, 503 y la web deriva al respaldo.
  if (!env.REVOLUT_MERCHANT_SECRET) return json({ error: "pagos_no_configurados" }, 503);

  const origin = new URL(request.url).origin;
  const ordenRevolut = {
    amount: totalCentimos,
    currency: "EUR",
    description: ("Tienda Welux — " + resumen.join(", ")).slice(0, 255),
    redirect_url: `${origin}/gracias.html?revolut=1`,
  };
  // Email del cliente si la web lo envia (opcional en la API de Revolut).
  if (typeof body?.email === "string" && body.email.includes("@")) {
    ordenRevolut.customer = { email: body.email.slice(0, 120) };
  }

  let orden;
  try {
    const revRes = await fetch("https://merchant.revolut.com/api/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.REVOLUT_MERCHANT_SECRET}`,
        "Revolut-Api-Version": "2026-08-17",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ordenRevolut),
    });
    orden = await revRes.json().catch(() => ({}));
    if (!revRes.ok || !orden.checkout_url) {
      return json(
        { error: "revolut_error", detalle: String(orden?.message || orden?.error || "desconocido").slice(0, 200) },
        502
      );
    }
  } catch {
    return json({ error: "revolut_inaccesible" }, 502);
  }
  return json({ url: orden.checkout_url, id: orden.id });
}


/* Estado real de un pago: gracias.html lo consulta antes de afirmar
   nada. Stripe: solo payment_status 'paid' cuenta. Revolut: solo el
   estado 'completed' cuenta ('authorised' es autorizado pero no
   cobrado). Sin el secreto del metodo pedido responde 503 (pendiente,
   nunca afirmado). Solo devuelve { ok, pagado, estado, metodo }: nada
   de PII ni de datos del pedido. Cuando el pago SI esta confirmado,
   anade `recibo` (referencia, fecha, moneda, total y articulos): es lo
   que gracias.html usa para mostrar la factura. Sin pagar, nunca se
   devuelve el recibo. El recibo no lleva email ni telefono. */

/* Lineas de una sesion de Stripe (lo cobrado de verdad): descripcion,
   cantidad y precio unitario. Si falla, se devuelve lista vacia y la
   factura muestra el total verificado sin desglose. */
async function lineItemsStripe(env, sessionId) {
  try {
    const res = await fetch(`${STRIPE_API_BASE}/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=100`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) return [];
    const d = await res.json().catch(() => ({}));
    return (Array.isArray(d.data) ? d.data : []).map((li) => ({
      nombre: String(li.description || "").slice(0, 200),
      cantidad: Math.max(1, parseInt(li.quantity, 10) || 1),
      precio_minor: Math.max(0, parseInt(li.price && li.price.unit_amount, 10) || 0),
    })).filter((a) => a.nombre);
  } catch {
    return [];
  }
}

async function handlePagoEstado(request, env) {
  const ip = ipDe(request);
  if (limited(ip, "pago-estado")) return json({ error: "demasiados_envios" }, 429);
  const url = new URL(request.url);
  const sessionId = (url.searchParams.get("session_id") || "").trim();
  const orderId = (url.searchParams.get("order_id") || "").trim();
  if (sessionId) {
    if (!env.STRIPE_SECRET_KEY) return json({ error: "pagos_no_configurados" }, 503);
    let sesion;
    try {
      const res = await fetch(`${STRIPE_API_BASE}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (res.status === 404) return json({ ok: true, pagado: false, estado: "no_encontrado", metodo: "stripe" });
      sesion = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: "stripe_error" }, 502);
    } catch {
      return json({ error: "stripe_inaccesible" }, 502);
    }
    const pagado = sesion.payment_status === "paid";
    if (pagado) await registrarPagoVerificado(env, "stripe", sessionId);
    const respuesta = { ok: true, pagado, estado: String(sesion.payment_status || "desconocido"), metodo: "stripe" };
    if (pagado) {
      respuesta.recibo = {
        metodo: "stripe",
        referencia: sessionId,
        fecha: sesion.created ? new Date(sesion.created * 1000).toISOString() : new Date().toISOString(),
        moneda: String(sesion.currency || "eur").toUpperCase(),
        total_minor: Math.max(0, parseInt(sesion.amount_total, 10) || 0),
        nombre: sesion.customer_details && sesion.customer_details.name ? String(sesion.customer_details.name).slice(0, 200) : null,
        articulos: await lineItemsStripe(env, sessionId),
      };
    }
    return json(respuesta);
  }
  if (orderId) {
    if (!env.REVOLUT_MERCHANT_SECRET) return json({ error: "pagos_no_configurados" }, 503);
    let orden;
    try {
      const res = await fetch(`https://merchant.revolut.com/api/orders/${encodeURIComponent(orderId)}`, {
        headers: {
          Authorization: `Bearer ${env.REVOLUT_MERCHANT_SECRET}`,
          "Revolut-Api-Version": "2026-08-17",
        },
      });
      if (res.status === 404) return json({ ok: true, pagado: false, estado: "no_encontrado", metodo: "revolut" });
      orden = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: "revolut_error" }, 502);
    } catch {
      return json({ error: "revolut_inaccesible" }, 502);
    }
    const estado = String(orden.state || "").toLowerCase();
    const pagado = estado === "completed";
    if (pagado) await registrarPagoVerificado(env, "revolut", orderId);
    const respuesta = { ok: true, pagado, estado: estado || "desconocido", metodo: "revolut" };
    if (pagado) {
      /* Revolut no trae lineas estructuradas: el importe, la moneda, la
         descripcion (la lista "2 x Articulo, ...") y las fechas vienen de
         la orden. Los articulos los pone gracias.html desde la cesta
         guardada; si no esta, usa la descripcion como respaldo. */
      respuesta.recibo = {
        metodo: "revolut",
        referencia: orderId,
        fecha: orden.completed_date || orden.created_date || new Date().toISOString(),
        moneda: String(orden.currency || "EUR").toUpperCase(),
        total_minor: Math.max(0, parseInt(orden.amount, 10) || 0),
        nombre: null,
        descripcion: String(orden.description || "").slice(0, 255),
        articulos: null,
      };
    }
    return json(respuesta);
  }
  return json({ error: "falta_session_id_o_order_id" }, 400);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = ipDe(request);
    if (url.pathname === "/api/checkout") {
      if (request.method !== "POST") return json({ error: "usa POST" }, 405);
      if (limited(ip, "checkout")) return json({ error: "demasiados_envios" }, 429);
      return handleCheckout(request, env);
    }
    if (url.pathname === "/api/revolut-checkout") {
      if (request.method !== "POST") return json({ error: "usa POST" }, 405);
      if (limited(ip, "revolut-checkout")) return json({ error: "demasiados_envios" }, 429);
      return handleRevolutCheckout(request, env);
    }
    if (url.pathname === "/api/productos") {
      if (request.method === "GET") return handleProductos(request, env);
      return json({ error: "usa GET" }, 405);
    }
    if (url.pathname === "/api/pedido") {
      if (request.method !== "POST") return json({ error: "usa POST" }, 405);
      if (limited(ip, "pedido")) return json({ error: "demasiados_envios" }, 429);
      return handlePedido(request, env);
    }
    if (url.pathname === "/api/bigbuy/status") {
      if (request.method === "GET") return handleBigbuyStatus(request, env);
      return json({ error: "usa GET" }, 405);
    }
    if (url.pathname === "/api/pago-estado") {
      if (request.method === "GET") return handlePagoEstado(request, env);
      return json({ error: "usa GET" }, 405);
    }
    /* Estatico: anadir las cabeceras de seguridad a lo que sirve ASSETS. */
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
