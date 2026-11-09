# Tienda Welux — Welux Digital Services

Clon de **La Mesita del Luiso** (`~/workspace/la-mesita-del-luiso/site/`, copiado el
09/11/2026; la fuente NO se tocó) adaptado como tienda en línea de
**Welux Digital Services SARL-S** para Luxemburgo. Publicada en GitHub
Pages: https://yoyocubano.github.io/tienda-welux/ (repo
`yoyocubano/tienda-welux`) y en Cloudflare Pages:
https://tienda-welux.pages.dev (proyecto `tienda-welux` conectado al mismo
repo; despliegue automático en cada push a `main`). En GitHub Pages el
checkout Stripe no corre (es un Worker de Cloudflare Pages): los pedidos
derivan al respaldo por correo a `info@weluxhub.com`.

## Qué es

Tienda estática (Cloudflare Pages, modo avanzado) con catálogo, cesta,
favoritos, valoraciones, cliente fiel con puntos, y checkout Stripe +
respaldo por WhatsApp/correo, igual que La Mesita. Diferencias con la fuente:

- **Moneda EUR** (no CUP ni USD). Sin calculadora de cambio ni tasas.
- **Marca Welux Digital Services**, contacto único `info@weluxhub.com`.
  Sin dirección ni teléfono públicos.
- **Estilo limpio** tipo weluxhub.com (azul marino + blanco, sin naranjas).
- **Catálogo propio** en `productos.json` (102 productos, ver abajo).
- **Respaldo WhatsApp por configurar**: el número va en `app.js`
  (`WHATSAPP_NUMERO`, vacío de momento). Mientras esté vacío, el pedido
  sale por correo a `info@weluxhub.com`.

## Estructura

```
index.html        Portada: catálogo, cómo comprar, qué incluye cada producto
gracias.html      Vuelta tras pagar en Stripe (vacía la cesta)
app.js            Lógica: catálogo, cesta, favoritos, checkout, respaldo
styles.css        Estilos limpios Welux
productos.json    Catálogo: 102 productos en EUR (precios a confirmar)
tasas.json        Reservado (EUR, sin conversión; la app no lo usa)
img/
  logo-welux.svg  Logotipo simple de Welux
  placeholder.svg Imagen genérica mientras no haya fotos reales
_worker.js        Worker Pages: /api/checkout (Stripe), /api/productos
                  (catálogo), /api/pedido (guarda en KV y/o envía por
                  Resend), /api/bigbuy/status (conector preparado, sin
                  cuenta). Moneda EUR.
_routes.json      Limita el worker a /api/*; el resto es estático
```

## Catálogo (102 productos, 12 categorías)

Catálogo inicial (87 productos) + 15 productos nuevos de las 5 categorías
prioritarias (09/11/2026, del informe de proveedores UE): lámparas modernas
con USB / HORECA, burotica (solo electrónica de oficina), soportes y
pantallas de proyector, simulador de golf, menú boards LED plegables. El
catálogo completo y actualizado está en `productos.json`.

| Categoría | Productos |
|---|---|
| Energía | Kit solar balcón 799 W, power station ~1000 Wh, power station ~500 Wh, panel solar portátil ~200 W |
| Persianas y calefacción | Motor Schellenberg 15 Nm, motor ARON 20 Nm, mando persiana, panel calefactor infrarrojo, panel calefactor 600 W |
| Smart home | Enchufe smart, pack bombillas + tira LED, cámara WiFi batería/solar, videoportero batería, válvula termostática radiador, cerradura smart Nuki, pack sensores, altavoz smart |
| Pantallas y AV | Smart display, marco fotos WiFi, monitor portátil USB-C, proyector smart portátil, Smart TV 43", pantalla señalización digital, dron cámara 4K, cámara acción + gimbal, kit Starlink, soportes de proyector Gembird/Aisens/MacLean, proyector Wanbo Full HD, pantallas vidaXL, simulador de golf celexon FAIRWAY |
| Red y oficina | Mesh WiFi 3 nodos, kit powerline PLC, repetidor WiFi, dock USB-C, webcam 4K, luz de streaming, monitor LED de oficina 24" (BigBuy) |
| Iluminación HORECA | Lámpara de escritorio con USB y carga inalámbrica (BigBuy Home), lámpara de mesa LED recargable Securit, lámpara de mesa táctil con USB V-TAC |
| Menú boards LED | Menú board LED «Convex», marco LED doble cara «Simple», muro LED «LED BOX™», pared plegable LED «Pano» (VKF Renzel) |
| Jardín | Riego smart |
| Guías PDF | Guía motor persiana, guía kit solar, guía panel calefactor, guía iluminación smart |

Regla de la tienda (del documento de origen): cada producto se vende como
**venta de material técnico + asesoría incluida + guía**. Welux no hace la
instalación: la hace el cliente con la guía o un tercero. Nada de cableado
fijo. Los servicios (limpieza, cuidados, babysitting, pet sitting,
compañía de adultos) NO son productos de esta tienda: van como plataforma
ConCompás aparte; en la web solo se mencionan con el correo de contacto.

## Precios: todos a confirmar

**Ningún producto tiene precio de venta confirmado.** En `productos.json`
todos llevan `precio_minorista: null` y la web muestra «Precio a
confirmar». Motivo: el documento de origen solo da precios de referencia
de compra o de instalación, no de venta:

- Kit solar balcón: ~629 € **instalado** (referencia en LU; el kit solo, a confirmar).
- Motor Schellenberg 15 Nm: 56,45 € en Hornbach (precio de **compra**, no de venta).

No se inventó ningún precio definitivo. Cuando el dueño confirme cada
precio de venta, se pone en `productos.json` y ese producto ya podrá
pagarse con tarjeta. Mientras un producto no tenga precio, el checkout
responde 422 y el pedido deriva al respaldo (WhatsApp/correo).

## Checkout y pagos: preparado, SIN activar

- El flujo Stripe está preparado como en La Mesita (`_worker.js`,
  `/api/checkout`, moneda EUR, precios tomados del catálogo publicado,
  nunca del navegador).
- **Sin claves reales, sin modo live, sin test activo.** No hay ninguna
  clave Stripe en el código ni en este proyecto.
- Para activar el cobro, el dueño pondrá `STRIPE_SECRET_KEY` (cuenta
  Stripe de Welux) en el proyecto de Pages cuando lo decida. Sin ese
  secreto, `/api/checkout` responde 503 y la web deriva el pedido al
  respaldo. Nadie se queda sin pedir y **nada cobra de verdad**.
- `POST /api/pedido` recibe el pedido cuando el pago en línea no procede:
  lo guarda en KV (`tienda-welux-pedidos`) y/o lo envía por correo con
  Resend, si están configurados. Sin KV ni Resend responde 503 y la web
  usa el respaldo mailto de siempre.
- `GET /api/bigbuy/status` dice si el conector BigBuy está configurado
  (preparado, sin cuenta: falta `BIGBUY_API_KEY`; el alta espera al
  nº TVA, ~23/11/2026). Sin pagos conectados.

## Despliegue

- **GitHub Pages** (https://yoyocubano.github.io/tienda-welux/): despliegue
  por API git-data con `deploy-tienda.py` (ver
  `~/workspace/goals/cerrar-proyectos-paso-a-paso-para-ser-rentable/hidden_files/`).
  Sigue en vivo como respaldo.
- **Cloudflare Pages** (https://tienda-welux.pages.dev): proyecto
  `tienda-welux` conectado al repo `yoyocubano/tienda-welux`, rama `main`,
  sin comando de build (estático). Cada push a `main` despliega
  automáticamente. El `_worker.js` del repo es el backend (modo avanzado
  de Pages). KV `tienda-welux-pedidos` ligado como `PEDIDOS`. Variables
  preparadas: `BIGBUY_API_KEY` (vacía) y `BIGBUY_API_BASE`
  (`https://api.sandbox.bigbuy.eu`). Ningún secreto de pago.

## Qué falta

1. **Precios de venta a confirmar** (102 productos) + margen por proveedor
   (estudio de precios en marcha).
2. **Número de WhatsApp de Welux** en `app.js` (`WHATSAPP_NUMERO`).
3. **Dominio** (p. ej. subdominio de weluxhub.com o dominio propio);
   de momento vive en `yoyocubano.github.io/tienda-welux/` y
   `tienda-welux.pages.dev`; **decisión del dueño** si se le pone
   dominio propio.
4. **`STRIPE_SECRET_KEY`** en Pages (solo cuando el dueño lo decida; los
   pagos son lo último, y el dueño quiere hablar antes de los métodos
   de pago: Stripe no será la única vía).
5. **Nº TVA** (~23/11/2026, por MyGuichet): desbloquea el alta en BigBuy
   y el reverse charge.
6. Textos FR/EN (ahora solo español) y condiciones de venta / entrega /
   devoluciones (entrega «a convenir en Luxemburgo», sin prometer plazos).
7. IVA: las ventas suman a la franquicia < 50.000 €/año (desde 2025);
   revisar con el contable antes de vender.

## Cómo se vería

Portada limpia azul marino/blanco: buscador, botones de categoría,
aviso de «precios a confirmar», hero con el modelo (producto + asesoría,
sin hacer el trabajo), tarjetas por producto con descripción, «Precio a
confirmar», entrega a convenir en Luxemburgo y botones de cesta y
favoritos. Cesta con cantidades, total «a confirmar», botón de confirmar
pedido y respaldo por correo (WhatsApp cuando se configure el número).

## Vista previa local (sin desplegar)

```bash
cd ~/workspace/tienda-welux
python3 -m http.server 8130
# abrir http://localhost:8130/
```

En local `/api/checkout` no existe (no hay worker): el checkout falla y
deriva al respaldo por correo, que es el comportamiento previsto sin
Stripe. Para probar el worker haría falta Pages; no se despliega sin
orden del dueño.
