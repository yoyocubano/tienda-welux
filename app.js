// Tienda Welux — Welux Digital Services (clon de La Mesita del Luiso, 09/11/2026)
// Moneda: EUR. Sin conversión ni tasas: la tienda cobra solo en euros.
// WhatsApp: respaldo por WhatsApp como en La Mesita, pero el número NO está
// puesto (no se publica ningún teléfono). Rellena WHATSAPP_NUMERO con el
// número de WhatsApp de Welux en formato internacional SIN '+' (p. ej.
// '352621XXXXXX'). Mientras esté vacío, el pedido sale por correo a
// info@weluxhub.com. El pago con tarjeta (Stripe) solo funciona cuando el
// dueño configure STRIPE_SECRET_KEY en el proyecto de Pages; sin ella, el
// checkout deriva al respaldo (WhatsApp o correo). Nada de modo live aquí.

const WHATSAPP_NUMERO = ""; // ← NÚMERO DE WHATSAPP DE WELUX (sin '+'), pendiente del dueño
const CONTACTO_EMAIL = "info@weluxhub.com";

let PRODUCTOS = [];
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
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function fmtEUR(v){
  return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(v);
}
function precioHTML(c){
  if(c.precio_minorista==null) return '<span class="price">Precio a confirmar</span>';
  return `<span class="price">${fmtEUR(c.precio_minorista)}</span>`;
}
function totalCarrito(){
  if(!carrito.length) return 'Total: —';
  const conPrecio = carrito.filter(i=>i.precio_minorista!=null);
  if(conPrecio.length!==carrito.length) return 'Total: a confirmar';
  const t = conPrecio.reduce((a,i)=>a+i.precio_minorista*i.cantidad,0);
  return 'Total: ' + fmtEUR(t);
}
function stars(id){
  const v = valoraciones[id];
  if(!v) return '<span style="font-size:13px;color:#565959">Sin valoraciones aún — toca una estrella</span>';
  const avg = (v.suma/v.n).toFixed(1);
  return `<span>${avg} (${v.n} valoraciones)</span>`;
}
function render(){
  let lista = PRODUCTOS.filter(c =>
    (categoria==='todos' || c.categoria===categoria) &&
    (c.nombre+' '+c.descripcion).toLowerCase().includes(busqueda.toLowerCase()) &&
    (!onlyFav || favoritos.includes(c.id))
  );
  if(sortMode==='az') lista.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  if(sortMode==='za') lista.sort((a,b)=>b.nombre.localeCompare(a.nombre));
  document.getElementById('count').textContent = lista.length + ' productos' + (busqueda ? ` para "${busqueda}"` : '') + (onlyFav ? ' · solo favoritos' : '');
  document.getElementById('grid').innerHTML = lista.map(c => `
    <article class="card">
      <img src="${c.imagen}" alt="${esc(c.nombre)}" loading="lazy" referrerpolicy="no-referrer">
      <div style="font-size:12px;color:#565959">Tienda Welux · Welux Digital Services</div>
      <h3>${esc(c.nombre)}</h3>
      <p><strong>Unidad:</strong> ${esc(c.unidad)}</p>
      <p>${esc(c.descripcion)}</p>
      <div>${precioHTML(c)}</div>
      <p style="font-size:13px;color:#007185">Asesoría y guía incluidas · Entrega a convenir en Luxemburgo · Sin instalación eléctrica</p>
      <div>${stars(c.id)}<br>
        <span style="cursor:pointer" onclick="valorar('${c.id}',1)">★</span><span style="cursor:pointer" onclick="valorar('${c.id}',2)">★</span><span style="cursor:pointer" onclick="valorar('${c.id}',3)">★</span><span style="cursor:pointer" onclick="valorar('${c.id}',4)">★</span><span style="cursor:pointer" onclick="valorar('${c.id}',5)">★</span>
      </div>
      <button class="add" onclick="agregar('${c.id}')">Añadir a la cesta</button>
      <button class="add" style="background:#fff" onclick="toggleFav('${c.id}')">${favoritos.includes(c.id) ? 'En favoritos — quitar' : 'Guardar en favoritos'}</button>
    </article>`).join('') || '<p>No se encontraron productos con esa búsqueda o filtro. Prueba otra palabra o quita el filtro.</p>';
  renderCarrito(); renderWish(); renderAccount();
}
function mensajePedido(numero){
  const lineas = carrito.map(i=>`• ${i.cantidad} × ${i.nombre} (${i.unidad})`).join('\n');
  return `Hola Tienda Welux, quiero hacer un pedido (${numero}):\n${lineas}\n${totalCarrito()}` + (usuario && usuario.nombre ? `\nSoy ${usuario.nombre}` : '');
}
function enviarRespaldo(numero){
  // Respaldo del pedido: WhatsApp si el número está configurado; si no,
  // correo a info@weluxhub.com. Nunca se pierde el pedido.
  const texto = mensajePedido(numero);
  if(WHATSAPP_NUMERO){
    window.open('https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(texto), '_blank');
  } else {
    location.href = 'mailto:' + CONTACTO_EMAIL + '?subject=' + encodeURIComponent('Pedido Tienda Welux ' + numero) + '&body=' + encodeURIComponent(texto);
  }
}
function renderCarrito(){
  const el = document.getElementById('cartItems'); if(!el) return;
  el.innerHTML = carrito.map(i=>`
    <div style="border-bottom:1px solid #eee;padding:8px 0">
      <strong>${esc(i.nombre)}</strong> · ${esc(i.unidad)}<br>
      <button onclick="cambiarCantidad('${i.id}',-1)">−</button> <span> ${i.cantidad} </span> <button onclick="cambiarCantidad('${i.id}',1)">+</button>
      <button onclick="quitar('${i.id}')" style="float:right">Quitar</button>
    </div>`).join('') || '<p>Tu cesta está vacía.</p>';
  document.getElementById('cartTotal').textContent = totalCarrito();
  document.getElementById('cartCount').textContent = carrito.reduce((a,i)=>a+i.cantidad,0);
  save('welux-cart', carrito);
  const floatBtn = document.getElementById('waFloat');
  if(floatBtn){
    if(WHATSAPP_NUMERO){
      const msg = carrito.length ? 'Hola Tienda Welux, quiero hacer un pedido: ' + carrito.map(i=>i.cantidad+' x '+i.nombre).join(', ') + '. ' + totalCarrito() + '.' : 'Hola Tienda Welux, quiero hacer un pedido.';
      floatBtn.href = 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(msg);
      floatBtn.textContent = 'WhatsApp';
    } else {
      floatBtn.href = 'mailto:' + CONTACTO_EMAIL + '?subject=' + encodeURIComponent('Consulta Tienda Welux');
      floatBtn.textContent = 'Contacto';
    }
  }
}
function renderWish(){
  const el = document.getElementById('wishItems'); if(!el) return;
  const items = PRODUCTOS.filter(c=>favoritos.includes(c.id));
  el.innerHTML = items.map(c=>`<div style="border-bottom:1px solid #eee;padding:8px 0"><strong>${esc(c.nombre)}</strong><br><button onclick="agregar('${c.id}')">Añadir a la cesta</button> <button onclick="toggleFav('${c.id}')">Quitar</button></div>`).join('') || '<p>Sin favoritos aún. Toca Guardar en favoritos en cualquier tarjeta.</p>';
  document.getElementById('wishCount').textContent = favoritos.length;
  save('welux-fav', favoritos);
}
function renderAccount(){
  const label = document.getElementById('accountLabel'); if(!label) return;
  const modeEl = document.getElementById('modeLabel'); if(modeEl) modeEl.textContent = 'Modo: ' + (modo==='cliente' && usuario ? 'Cliente Welux — ' + usuario.nombre : 'Visitante');
  label.textContent = (modo==='cliente' && usuario) ? usuario.nombre : 'Cliente Welux';
  const info = document.getElementById('userInfo'); if(info) info.textContent = usuario ? `Hola ${usuario.nombre}. Puntos de fidelidad: ${usuario.puntos||0}. Pedidos guardados: ${pedidos.length}.` : 'Aún no estás fidelizado. Guarda tu nombre arriba para acumular puntos.';
  const ol = document.getElementById('ordersList'); if(ol) ol.innerHTML = pedidos.map(o=>`<div style="border-bottom:1px solid #eee;padding:8px 0"><strong>${o.numero}</strong> · ${o.fecha}<br>${esc(o.items)}<br>Total: a confirmar</div>`).join('') || '<p>Sin pedidos aún.</p>';
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
async function cargar(){
  try{ const r = await fetch('./productos.json'); const j = await r.json(); PRODUCTOS = Array.isArray(j) ? j : (j.productos || []); }catch(e){ PRODUCTOS = []; }
  const th = load('welux-theme','claro'); document.getElementById('themeSel').value = th; document.body.classList.toggle('dark', th==='oscuro');
  const tx = load('welux-text','normal'); document.getElementById('textSel').value = tx; document.body.classList.toggle('bigtext', tx==='grande');
  render();
}
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('nav button[data-cat]').forEach(b=>{ b.onclick = ()=>{ categoria=b.dataset.cat; document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); render(); }; });
  const q = document.getElementById('q'); if(q) q.addEventListener('input', e=>{ busqueda=e.target.value.trim(); render(); });
  document.getElementById('searchBtn').onclick = ()=>{ busqueda=q.value.trim(); render(); q.focus(); };
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
    if(!carrito.length) return alert('Tu cesta está vacía. Añade un producto primero.');
    const checkoutBtn = document.getElementById('checkout');
    const numero = 'WLX-' + String(pedidos.length+1).padStart(3,'0');
    const resumen = carrito.map(i=>`${i.cantidad} × ${i.nombre} (${i.unidad})`).join(', ');
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
    pedidos.unshift({numero: numeroFinal, fecha:new Date().toLocaleDateString('es-ES'), items:resumen}); save('welux-orders', pedidos);
    if(modo==='cliente' && usuario){ usuario.puntos = (usuario.puntos||0) + carrito.reduce((a,i)=>a+i.cantidad,0); save('welux-user', usuario); }
    carrito=[]; save('welux-cart', carrito); render(); renderCarrito();
    if(pedidoBackend && pedidoBackend.numero){
      alert('Pedido ' + pedidoBackend.numero + ' registrado. Te confirmamos el precio por correo antes de cobrar nada.');
    } else {
      enviarRespaldo(numero);
    }
  };
  document.getElementById('closeAccount').onclick = ()=>document.getElementById('accountDrawer').classList.remove('open');
  document.getElementById('saveUser').onclick = ()=>{
    const nombre = document.getElementById('userName').value.trim(); if(!nombre) return alert('Escribe tu nombre para fidelizarte.');
    usuario = {nombre, telefono:document.getElementById('userPhone').value.trim(), puntos:(usuario&&usuario.puntos)||0}; modo='cliente'; save('welux-user', usuario); save('welux-mode', modo); renderAccount(); alert('Bienvenido, '+nombre+'! Ya eres cliente Welux. Cada pedido te suma puntos.');
  };
  document.getElementById('logoutUser').onclick = ()=>{ modo='visitante'; save('welux-mode', modo); renderAccount(); document.getElementById('accountDrawer').classList.remove('open'); };
  document.getElementById('visitorBtn').onclick = ()=>{ modo='visitante'; save('welux-mode', modo); renderAccount(); alert('Estás navegando como visitante. Puedes buscar, guardar favoritos y comprar sin registrarte.'); };
  document.getElementById('closeWish').onclick = ()=>document.getElementById('wishDrawer').classList.remove('open');
  document.getElementById('themeSel').onchange = aplicarAjustes;
  document.getElementById('textSel').onchange = aplicarAjustes;
  document.getElementById('sortSel').onchange = e=>{ sortMode=e.target.value; render(); };
  document.getElementById('onlyFav').onchange = e=>{ onlyFav=e.target.checked; render(); };
  document.getElementById('clearDataBtn').onclick = ()=>{ if(!confirm('¿Borrar tus datos guardados en este dispositivo (cuenta, favoritos, valoraciones, pedidos, cesta)?')) return; localStorage.removeItem('welux-user'); localStorage.removeItem('welux-fav'); localStorage.removeItem('welux-ratings'); localStorage.removeItem('welux-orders'); localStorage.removeItem('welux-cart'); location.reload(); };
  cargar();
});
