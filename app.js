// Tienda Welux — Welux Digital Services (clon de La Mesita del Luiso, 09/11/2026)
// Moneda: EUR. Sin conversión ni tasas: la tienda cobra solo en euros.
// WhatsApp: respaldo por WhatsApp como en La Mesita, pero el número NO está
// puesto (no se publica ningún teléfono). Rellena WHATSAPP_NUMERO con el
// número de WhatsApp de Welux en formato internacional SIN '+' (p. ej.
// '352621XXXXXX'). Mientras esté vacío, el pedido sale por correo a
// info@weluxhub.com. El pago con tarjeta (Stripe) solo funciona cuando el
// dueño configure STRIPE_SECRET_KEY en el proyecto de Pages; sin ella, el
// checkout deriva al respaldo (WhatsApp o correo). Nada de modo live aquí.
//
// Idiomas (i18n, 09/11/2026): EN (por defecto), FR, ES, PT. Todas las
// traducciones viven en i18n.json (interfaz + productos por id); este archivo
// solo las aplica. La elección persiste en localStorage ('welux-lang').

const WHATSAPP_NUMERO = ""; // ← NÚMERO DE WHATSAPP DE WELUX (sin '+'), pendiente del dueño
const CONTACTO_EMAIL = "info@weluxhub.com";

let PRODUCTOS = [];
let I18N = null;
let LANG = 'en';
const LANGS = ['en', 'fr', 'es', 'pt'];
const LOCALES = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', pt: 'pt-PT' };
// Productos BigBuy pedibles con formulario de contacto (decisión del dueño
// 09/11/2026): se quedan con precio de mercado Y se pueden pedir; Welux los
// gestiona a mano con el proveedor. Solo estos 5 llevan botón de pedir.
const BIGBUY_ORDERABLE = ['soporte-proyector-gembird-cm-b-01', 'soporte-proyector-aisens-cp02tsre-051', 'soporte-proyector-maclean-mc-945', 'proyector-wanbo-full-hd', 'lampara-escritorio-usb-bigbuy-home'];
let pedidoProducto = null; // id del producto del formulario de pedido abierto
let categoria = 'todos';
let busqueda = '';
let sortMode = 'relevancia';
let onlyFav = false;
let carrito = [];
let favoritos = [];
let valoraciones = {};
let usuario = null;
let pedidos = [];
let modo = 'visitante';
function load(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
carrito = load('welux-cart', []);
favoritos = load('welux-fav', []);
valoraciones = load('welux-ratings', {});
usuario = load('welux-user', null);
pedidos = load('welux-orders', []);
modo = load('welux-mode', 'visitante');
try{ const l = localStorage.getItem('welux-lang'); if(l && LANGS.includes(l)) LANG = l; }catch(e){}
// --- i18n ---
function t(key, vars){
  let s = null;
  if(I18N && I18N.ui && I18N.ui[key]) s = I18N.ui[key][LANG] || I18N.ui[key].en || I18N.ui[key].es;
  if(s == null) return key;
  if(vars) for(const k in vars) s = s.replaceAll('{'+k+'}', vars[k]);
  return s;
}
function tp(id, field){
  // Nombre/descripción traducidos del producto; si falta, el texto ES de productos.json.
  const p = PRODUCTOS.find(x=>x.id===id);
  const tr = I18N && I18N.products && I18N.products[id] && I18N.products[id][LANG];
  if(tr && tr[field]) return tr[field];
  return p ? p[field] : '';
}
function tu(unidadES){
  if(I18N && I18N.ui && I18N.ui.units){
    const m = I18N.ui.units[LANG] || I18N.ui.units.en;
    if(m && m[unidadES]) return m[unidadES];
  }
  return unidadES;
}
function prodNombre(c){ return tp(c.id, 'nombre') || c.nombre; }
function prodDesc(c){ return tp(c.id, 'descripcion') || c.descripcion; }
function cartNombre(i){
  const p = PRODUCTOS.find(x=>x.id===i.id);
  if(p) return prodNombre(p);
  return i.nombre || '';
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function fmtEUR(v){
  return new Intl.NumberFormat(LOCALES[LANG] || 'en-GB',{style:'currency',currency:'EUR'}).format(v);
}
function precioHTML(c){
  if(c.precio_minorista==null) return '<span class="price">' + esc(t('price_to_confirm')) + '</span>';
  return `<span class="price">${fmtEUR(c.precio_minorista)}</span>`;
}
function totalCarrito(){
  if(!carrito.length) return t('total_dash');
  const conPrecio = carrito.filter(i=>i.precio_minorista!=null);
  if(conPrecio.length!==carrito.length) return t('total_to_confirm');
  const tot = conPrecio.reduce((a,i)=>a+i.precio_minorista*i.cantidad,0);
  return t('total_prefix') + fmtEUR(tot);
}
function stars(id){
  const v = valoraciones[id];
  if(!v) return '<span style="font-size:13px;color:#565959">' + esc(t('no_ratings')) + '</span>';
  const avg = (v.suma/v.n).toFixed(1);
  return `<span>${esc(t('ratings', {avg, n: v.n}))}</span>`;
}
function render(){
  let lista = PRODUCTOS.filter(c =>
    (categoria==='todos' || c.categoria===categoria) &&
    (prodNombre(c)+' '+prodDesc(c)+' '+c.nombre+' '+c.descripcion).toLowerCase().includes(busqueda.toLowerCase()) &&
    (!onlyFav || favoritos.includes(c.id))
  );
  if(sortMode==='az') lista.sort((a,b)=>prodNombre(a).localeCompare(prodNombre(b), LOCALES[LANG]));
  if(sortMode==='za') lista.sort((a,b)=>prodNombre(b).localeCompare(prodNombre(a), LOCALES[LANG]));
  document.getElementById('count').textContent = t('count_products', {n: lista.length}) + (busqueda ? t('count_for', {q: busqueda}) : '') + (onlyFav ? t('count_only_fav') : '');
  document.getElementById('grid').innerHTML = lista.map(c => `
    <article class="card">
      <img src="${c.imagen}" alt="${esc(prodNombre(c))}" loading="lazy" referrerpolicy="no-referrer">
      <div style="font-size:12px;color:#565959">${esc(t('brand_line'))}</div>
      <h3>${esc(prodNombre(c))}</h3>
      <p><strong>${esc(t('unit_label'))}</strong> ${esc(tu(c.unidad))}</p>
      <p>${esc(prodDesc(c))}</p>
      <div>${precioHTML(c)}</div>
      <p style="font-size:13px;color:#007185">${esc(t('advice_line'))}</p>
      <div>${stars(c.id)}<br>
        <span style="cursor:pointer" onclick="valorar('${c.id}',1)">★</span><span style="cursor:pointer" onclick="valorar('${c.id}',2)">★</span><span style="cursor:pointer" onclick="valorar('${c.id}',3)">★</span><span style="cursor:pointer" onclick="valorar('${c.id}',4)">★</span><span style="cursor:pointer" onclick="valorar('${c.id}',5)">★</span>
      </div>
      <button class="add" onclick="agregar('${c.id}')">${esc(t('add_to_cart'))}</button>
      ${BIGBUY_ORDERABLE.includes(c.id) ? `<button class="add orderBtn" onclick="abrirPedido('${c.id}')">${esc(t('order_button'))}</button>` : ''}
      <button class="add" style="background:#fff" onclick="toggleFav('${c.id}')">${esc(favoritos.includes(c.id) ? t('in_fav_remove') : t('save_fav'))}</button>
    </article>`).join('') || '<p>' + esc(t('no_results')) + '</p>';
  renderCarrito(); renderWish(); renderAccount();
}
function mensajePedido(numero){
  const lineas = carrito.map(i=>`• ${i.cantidad} × ${cartNombre(i)} (${tu(i.unidad)})`).join('\n');
  return t('order_hello', {num: numero}) + '\n' + lineas + '\n' + totalCarrito() + (usuario && usuario.nombre ? '\n' + t('order_i_am', {name: usuario.nombre}) : '');
}
function enviarRespaldo(numero){
  // Respaldo del pedido: WhatsApp si el número está configurado; si no,
  // correo a info@weluxhub.com. Nunca se pierde el pedido.
  const texto = mensajePedido(numero);
  if(WHATSAPP_NUMERO){
    window.open('https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(texto), '_blank');
  } else {
    location.href = 'mailto:' + CONTACTO_EMAIL + '?subject=' + encodeURIComponent(t('order_subject', {num: numero})) + '&body=' + encodeURIComponent(texto);
  }
}
// --- Formulario de pedido (solo productos BigBuy) ---
function lineaPedido(){
  if(!pedidoProducto) return;
  const c = PRODUCTOS.find(x=>x.id===pedidoProducto); if(!c) return;
  const precio = c.precio_minorista==null ? t('price_to_confirm') : fmtEUR(c.precio_minorista);
  const el = document.getElementById('orderProductLine');
  if(el) el.innerHTML = '<strong>' + esc(t('order_product')) + ':</strong> ' + esc(prodNombre(c)) + ' — ' + esc(precio);
}
function abrirPedido(id){
  const c = PRODUCTOS.find(x=>x.id===id); if(!c) return;
  pedidoProducto = id;
  const n = document.getElementById('orderName'); if(n && usuario && usuario.nombre) n.value = usuario.nombre;
  const q = document.getElementById('orderQty'); if(q) q.value = 1;
  const m = document.getElementById('orderMsg'); if(m) m.value = '';
  lineaPedido();
  const modal = document.getElementById('orderModal'); if(modal) modal.style.display = 'flex';
}
function cerrarPedido(){
  pedidoProducto = null;
  const modal = document.getElementById('orderModal'); if(modal) modal.style.display = 'none';
}
function enviarPedido(e){
  e.preventDefault();
  const c = PRODUCTOS.find(x=>x.id===pedidoProducto); if(!c) return;
  const nombre = document.getElementById('orderName').value.trim();
  const correo = document.getElementById('orderEmail').value.trim();
  const cantidad = Math.max(1, parseInt(document.getElementById('orderQty').value, 10) || 1);
  const mensaje = document.getElementById('orderMsg').value.trim();
  if(!nombre) return alert(t('order_alert_name'));
  if(!correo || !correo.includes('@')) return alert(t('order_alert_email'));
  const precio = c.precio_minorista==null ? t('price_to_confirm') : fmtEUR(c.precio_minorista);
  const asunto = t('order_form_subject', {product: prodNombre(c)});
  const cuerpo = t('order_mail_body', {product: prodNombre(c), price: precio, qty: String(cantidad), name: nombre, email: correo, message: mensaje || '—'});
  cerrarPedido();
  location.href = 'mailto:' + CONTACTO_EMAIL + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
  // Panel de confirmación: el pedido queda listo para copiar por si el
  // correo no se abre.
  mostrarFallback(cuerpo, asunto);
}
// --- Panel de confirmación del pedido (fallback si el correo no se abre) ---
function mostrarFallback(texto, asunto){
  const ta = document.getElementById('fallbackText'); if(ta) ta.value = texto;
  const ml = document.getElementById('fallbackMailto');
  if(ml) ml.href = 'mailto:' + CONTACTO_EMAIL + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(texto);
  const p = document.getElementById('fallbackPanel'); if(p) p.style.display = 'flex';
}
function cerrarFallback(){
  const p = document.getElementById('fallbackPanel'); if(p) p.style.display = 'none';
}
async function copiarPedido(){
  const ta = document.getElementById('fallbackText'); if(!ta) return;
  const texto = ta.value;
  try{ await navigator.clipboard.writeText(texto); }
  catch(e){ ta.select(); try{ document.execCommand('copy'); }catch(e2){} }
  alert(t('fallback_copied'));
}
function renderCarrito(){
  const el = document.getElementById('cartItems'); if(!el) return;
  el.innerHTML = carrito.map(i=>`
    <div style="border-bottom:1px solid #eee;padding:8px 0">
      <strong>${esc(cartNombre(i))}</strong> · ${esc(tu(i.unidad))}<br>
      <button onclick="cambiarCantidad('${i.id}',-1)">−</button> <span> ${i.cantidad} </span> <button onclick="cambiarCantidad('${i.id}',1)">+</button>
      <button onclick="quitar('${i.id}')" style="float:right">${esc(t('remove'))}</button>
    </div>`).join('') || '<p>' + esc(t('cart_empty')) + '</p>';
  document.getElementById('cartTotal').textContent = totalCarrito();
  document.getElementById('cartCount').textContent = carrito.reduce((a,i)=>a+i.cantidad,0);
  save('welux-cart', carrito);
  const floatBtn = document.getElementById('waFloat');
  if(floatBtn){
    if(WHATSAPP_NUMERO){
      const msg = carrito.length ? t('order_whatsapp_msg') + carrito.map(i=>i.cantidad+' x '+cartNombre(i)).join(', ') + '. ' + totalCarrito() + '.' : t('order_whatsapp_msg_empty');
      floatBtn.href = 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(msg);
      floatBtn.textContent = t('whatsapp_float');
    } else {
      floatBtn.href = 'mailto:' + CONTACTO_EMAIL + '?subject=' + encodeURIComponent(t('consult_subject'));
      floatBtn.textContent = t('contact_float');
    }
  }
}
function renderWish(){
  const el = document.getElementById('wishItems'); if(!el) return;
  const items = PRODUCTOS.filter(c=>favoritos.includes(c.id));
  el.innerHTML = items.map(c=>`<div style="border-bottom:1px solid #eee;padding:8px 0"><strong>${esc(prodNombre(c))}</strong><br><button onclick="agregar('${c.id}')">${esc(t('add_to_cart'))}</button> <button onclick="toggleFav('${c.id}')">${esc(t('remove'))}</button></div>`).join('') || '<p>' + esc(t('wish_empty')) + '</p>';
  document.getElementById('wishCount').textContent = favoritos.length;
  save('welux-fav', favoritos);
}
function renderAccount(){
  const label = document.getElementById('accountLabel'); if(!label) return;
  const modeEl = document.getElementById('modeLabel'); if(modeEl) modeEl.textContent = (modo==='cliente' && usuario) ? t('mode_client', {name: usuario.nombre}) : t('mode_visitor');
  label.textContent = (modo==='cliente' && usuario) ? usuario.nombre : t('account_client');
  const info = document.getElementById('userInfo'); if(info) info.textContent = usuario ? t('user_info_hello', {name: usuario.nombre, points: usuario.puntos||0, orders: pedidos.length}) : t('user_info_no');
  const ol = document.getElementById('ordersList'); if(ol) ol.innerHTML = pedidos.map(o=>`<div style="border-bottom:1px solid #eee;padding:8px 0"><strong>${o.numero}</strong> · ${o.fecha}<br>${esc(o.items)}<br>${esc(t('total_to_confirm'))}</div>`).join('') || '<p>' + esc(t('no_orders')) + '</p>';
  const un = document.getElementById('userName'); if(un && usuario) un.value = usuario.nombre;
  const up = document.getElementById('userPhone'); if(up && usuario) up.value = usuario.telefono||'';
}
function agregar(id){
  const c = PRODUCTOS.find(x=>x.id===id); if(!c) return;
  const item = carrito.find(i=>i.id===id);
  if(item) item.cantidad++; else carrito.push({id, nombre:c.nombre, unidad:c.unidad, precio_minorista:c.precio_minorista, cantidad:1});
  renderCarrito(); document.getElementById('drawer').classList.add('open');
}
function cambiarCantidad(id, d){
  const item = carrito.find(i=>i.id===id); if(!item) return;
  item.cantidad += d; if(item.cantidad<=0) carrito = carrito.filter(i=>i.id!==id); renderCarrito();
}
function quitar(id){ carrito = carrito.filter(i=>i.id!==id); renderCarrito(); }
function toggleFav(id){
  favoritos = favoritos.includes(id) ? favoritos.filter(x=>x!==id) : [...favoritos, id];
  render(); renderWish();
}
function valorar(id, n){
  const v = valoraciones[id] || {suma:0, n:0}; v.suma += n; v.n++; valoraciones[id]=v; save('welux-ratings', valoraciones); render();
}
function aplicarAjustes(){
  const theme = document.getElementById('themeSel').value;
  document.body.classList.toggle('dark', theme==='oscuro');
  document.body.classList.toggle('bigtext', document.getElementById('textSel').value==='grande');
  save('welux-theme', theme); save('welux-text', document.getElementById('textSel').value);
}
// --- cambio de idioma ---
function applyLanguage(){
  if(!I18N) return;
  document.documentElement.lang = LANG;
  document.title = t('meta_title');
  const md = document.querySelector('meta[name="description"]'); if(md) md.setAttribute('content', t('meta_description'));
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const v = t(el.dataset.i18n);
    if(v !== el.dataset.i18n) el.innerHTML = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{ el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  const lbl = document.getElementById('langBtnLabel'); if(lbl) lbl.textContent = LANG.toUpperCase();
  const sel = document.getElementById('langSel'); if(sel) sel.value = LANG;
  document.querySelectorAll('#langMenu button[data-lang]').forEach(b=>b.classList.toggle('active', b.dataset.lang===LANG));
  if(pedidoProducto) lineaPedido(); // el producto del formulario, en el idioma nuevo
}
function setLang(lang){
  if(!LANGS.includes(lang)) return;
  LANG = lang;
  try{ localStorage.setItem('welux-lang', lang); }catch(e){}
  applyLanguage();
  render();
}
async function cargar(){
  try{
    const [rp, ri] = await Promise.all([fetch('./productos.json?v=20261110'), fetch('./i18n.json?v=20261110')]);
    const j = await rp.json(); PRODUCTOS = Array.isArray(j) ? j : (j.productos || []);
    try{ I18N = await ri.json(); }catch(e){ I18N = null; }
  }catch(e){ PRODUCTOS = []; }
  const th = load('welux-theme','claro'); document.getElementById('themeSel').value = th; document.body.classList.toggle('dark', th==='oscuro');
  const tx = load('welux-text','normal'); document.getElementById('textSel').value = tx; document.body.classList.toggle('bigtext', tx==='grande');
  applyLanguage();
  render();
}
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('nav button[data-cat]').forEach(b=>{ b.onclick = ()=>{ categoria=b.dataset.cat; document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); render(); }; });
  const q = document.getElementById('q'); if(q) q.addEventListener('input', e=>{ busqueda=e.target.value.trim(); render(); });
  document.getElementById('searchBtn').onclick = ()=>{ busqueda=q.value.trim(); render(); q.focus(); };
  // Selector de idioma (globo 🌐 en la cabecera + select del menú)
  const langBtn = document.getElementById('langBtn'), langMenu = document.getElementById('langMenu');
  if(langBtn && langMenu){
    langBtn.onclick = (e)=>{ e.stopPropagation(); const open = langMenu.classList.toggle('open'); langBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    langMenu.querySelectorAll('button[data-lang]').forEach(b=>{ b.onclick = ()=>{ setLang(b.dataset.lang); langMenu.classList.remove('open'); langBtn.setAttribute('aria-expanded','false'); }; });
    document.addEventListener('click', (e)=>{ if(!langMenu.contains(e.target) && e.target!==langBtn) langMenu.classList.remove('open'); });
  }
  const langSel = document.getElementById('langSel');
  if(langSel) langSel.onchange = e=>setLang(e.target.value);
  function openMenu(){ document.getElementById('menuDrawer').classList.add('open'); document.getElementById('menuBackdrop').classList.add('show'); }
  function closeMenu(){ document.getElementById('menuDrawer').classList.remove('open'); document.getElementById('menuBackdrop').classList.remove('show'); }
  document.getElementById('menuBtn').onclick = openMenu;
  document.getElementById('menuBtn').addEventListener('touchstart', e=>{ e.preventDefault(); openMenu(); }, {passive:false});
  document.getElementById('closeMenu').onclick = closeMenu;
  const bd = document.getElementById('menuBackdrop');
  bd.onclick = closeMenu;
  bd.addEventListener('touchstart', e=>{ e.preventDefault(); closeMenu(); }, {passive:false});
  let swipeX = null, swipeY = null;
  function swipeStart(e){ const t = e.touches[0]; swipeX = t.clientX; swipeY = t.clientY; }
  function swipeEnd(e){
    if(swipeX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeX, dy = t.clientY - swipeY;
    swipeX = null; swipeY = null;
    if(dx > 60 && Math.abs(dx) > Math.abs(dy)) closeMenu();
  }
  ['menuDrawer','menuBackdrop'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){ el.addEventListener('touchstart', swipeStart, {passive:true}); el.addEventListener('touchend', swipeEnd, {passive:true}); }
  });
  document.addEventListener('touchstart', e=>{
    if(!document.getElementById('menuDrawer').classList.contains('open')) return;
    swipeStart(e);
  }, {passive:true});
  document.addEventListener('touchend', e=>{
    if(!document.getElementById('menuDrawer').classList.contains('open')) return;
    swipeEnd(e);
  }, {passive:true});
  document.getElementById('cartBtn').onclick = ()=>{ closeMenu(); document.getElementById('drawer').classList.add('open'); };
  document.getElementById('accountBtn').onclick = ()=>{ closeMenu(); document.getElementById('accountDrawer').classList.add('open'); };
  document.getElementById('wishBtn').onclick = ()=>{ closeMenu(); document.getElementById('wishDrawer').classList.add('open'); };
  document.getElementById('closeCart').onclick = ()=>document.getElementById('drawer').classList.remove('open');
  document.getElementById('clearCart').onclick = ()=>{ carrito=[]; renderCarrito(); };
  document.getElementById('checkout').onclick = async ()=>{
    if(!carrito.length) return alert(t('alert_cart_empty'));
    const checkoutBtn = document.getElementById('checkout');
    const numero = 'WLX-' + String(pedidos.length+1).padStart(3,'0');
    const resumen = carrito.map(i=>`${i.cantidad} × ${cartNombre(i)} (${tu(i.unidad)})`).join(', ');
    // 1) Pago en línea (Stripe Checkout): el servidor crea la sesión con los
    //    precios del catálogo publicado. Solo procede si TODOS los productos
    //    del carrito tienen precio confirmado; si falta alguno, responde 422.
    //    Sin STRIPE_SECRET_KEY responde 503. En ambos casos se deriva al
    //    respaldo (WhatsApp o correo): nadie se queda sin pedir.
    checkoutBtn.disabled = true;
    try{
      const r = await fetch('./api/checkout', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items: carrito.map(i=>({id:i.id, cantidad:i.cantidad}))})});
      if(r.ok){
        const d = await r.json();
        if(d.url){ location.href = d.url; return; } // a pagar a Stripe; la cesta se vacía en gracias.html
      }
    }catch(e){ /* pago en línea no disponible: se sigue por el respaldo */ }
    checkoutBtn.disabled = false;
    // 1b) Pedido por el backend (Worker): lo guarda y lo envía por correo a
    // Welux. Si el backend no está configurado (503) o no responde, se sigue
    // por el respaldo mailto de siempre: ningún pedido se pierde.
    let pedidoBackend = null;
    try{
      const pr = await fetch('./api/pedido', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items: carrito.map(i=>({id:i.id, cantidad:i.cantidad})), nombre: (usuario && usuario.nombre) || null, telefono: (usuario && usuario.telefono) || null})});
      if(pr.ok){ pedidoBackend = await pr.json(); }
    }catch(e){ /* backend no disponible: se sigue por el respaldo */ }
    // 2) Respaldo: el pedido llega a Welux por WhatsApp (si está configurado)
    //    o por correo a info@weluxhub.com, con el resumen y el total.
    const numeroFinal = (pedidoBackend && pedidoBackend.numero) || numero;
    pedidos.unshift({numero: numeroFinal, fecha:new Date().toLocaleDateString(LOCALES[LANG] || 'en-GB'), items:resumen}); save('welux-orders', pedidos);
    if(modo==='cliente' && usuario){ usuario.puntos = (usuario.puntos||0) + carrito.reduce((a,i)=>a+i.cantidad,0); save('welux-user', usuario); }
    carrito=[]; save('welux-cart', carrito); render(); renderCarrito();
    if(pedidoBackend && pedidoBackend.numero){
      alert(t('alert_order_registered', {num: pedidoBackend.numero}));
    } else {
      // Respaldo: se intenta abrir el correo Y se muestra el panel de
      // confirmación con el pedido listo para copiar (por si el correo no
      // se abre, el pedido nunca se pierde).
      const texto = mensajePedido(numero);
      enviarRespaldo(numero);
      mostrarFallback(texto, t('order_subject', {num: numero}));
    }
  };
  document.getElementById('closeAccount').onclick = ()=>document.getElementById('accountDrawer').classList.remove('open');
  document.getElementById('saveUser').onclick = ()=>{
    const nombre = document.getElementById('userName').value.trim(); if(!nombre) return alert(t('alert_name_required'));
    usuario = {nombre, telefono:document.getElementById('userPhone').value.trim(), puntos:(usuario&&usuario.puntos)||0}; modo='cliente'; save('welux-user', usuario); save('welux-mode', modo); renderAccount(); alert(t('alert_welcome', {name: nombre}));
  };
  document.getElementById('logoutUser').onclick = ()=>{ modo='visitante'; save('welux-mode', modo); renderAccount(); document.getElementById('accountDrawer').classList.remove('open'); };
  document.getElementById('visitorBtn').onclick = ()=>{ modo='visitante'; save('welux-mode', modo); renderAccount(); alert(t('alert_visitor')); };
  document.getElementById('closeWish').onclick = ()=>document.getElementById('wishDrawer').classList.remove('open');
  // Formulario de pedido (productos BigBuy): modal + envío por correo.
  const orderForm = document.getElementById('orderForm');
  if(orderForm) orderForm.addEventListener('submit', enviarPedido);
  const orderCancel = document.getElementById('orderCancel');
  if(orderCancel) orderCancel.onclick = cerrarPedido;
  const orderModal = document.getElementById('orderModal');
  if(orderModal) orderModal.addEventListener('click', e=>{ if(e.target===orderModal) cerrarPedido(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ cerrarPedido(); cerrarFallback(); } });
  // Panel de confirmación del pedido (fallback): copiar + cerrar.
  const fbCopy = document.getElementById('fallbackCopy');
  if(fbCopy) fbCopy.onclick = copiarPedido;
  const fbClose = document.getElementById('fallbackClose');
  if(fbClose) fbClose.onclick = cerrarFallback;
  const fbPanel = document.getElementById('fallbackPanel');
  if(fbPanel) fbPanel.addEventListener('click', e=>{ if(e.target===fbPanel) cerrarFallback(); });
  document.getElementById('themeSel').onchange = aplicarAjustes;
  document.getElementById('textSel').onchange = aplicarAjustes;
  document.getElementById('sortSel').onchange = e=>{ sortMode=e.target.value; render(); };
  document.getElementById('onlyFav').onchange = e=>{ onlyFav=e.target.checked; render(); };
  document.getElementById('clearDataBtn').onclick = ()=>{ if(!confirm(t('confirm_clear_data'))) return; localStorage.removeItem('welux-user'); localStorage.removeItem('welux-fav'); localStorage.removeItem('welux-ratings'); localStorage.removeItem('welux-orders'); localStorage.removeItem('welux-cart'); location.reload(); };
  cargar();
});
