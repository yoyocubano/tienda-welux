# Tienda Welux — Welux Digital Services

Clon de **La Mesita del Luiso** (`~/workspace/la-mesita-del-luiso/site/`, copiado el
09/11/2026; la fuente NO se tocó) adaptado como tienda en línea de
**Welux Digital Services SARL-S** para Luxemburgo. Publicada en GitHub
Pages: https://yoyocubano.github.io/tienda-welux/ (repo
`yoyocubano/tienda-welux`). En GitHub Pages el checkout Stripe no corre
(es un Worker de Cloudflare Pages): los pedidos derivan al respaldo por
correo a `info@weluxhub.com`.

## Qué es

Tienda estática (Cloudflare Pages, modo avanzado) con catálogo, cesta,
favoritos, valoraciones, cliente fiel con puntos, y checkout Stripe +
respaldo por WhatsApp/correo, igual que La Mesita. Diferencias con la fuente:

- **Moneda EUR** (no CUP ni USD). Sin calculadora de cambio ni tasas.
- **Marca Welux Digital Services**, contacto único `info@weluxhub.com`.
  Sin dirección ni teléfono públicos.
- **Estilo limpio** tipo weluxhub.com (azul marino + blanco, sin naranjas).
- **Catálogo propio** en `productos.json` (87 productos, ver abajo).
- **Respaldo WhatsApp por configurar**: el número va en `app.js`
  (`WHATSAPP_NUMERO`, vacío de momento). Mientras esté vacío, el pedido
  sale por correo a `info@weluxhub.com`.

## Estructura

```
index.html        Portada: catálogo, cómo comprar, qué incluye cada producto
gracias.html      Vuelta tras pagar en Stripe (vacía la cesta)
app.js            Lógica: catálogo, cesta, favoritos, checkout, respaldo
styles.css        Estilos limpios Welux
productos.json    Catálogo: 87 productos en EUR (precios a confirmar)
tasas.json        Reservado (EUR, sin conversión; la app no lo usa)
img/
  logo-welux.svg  Logotipo simple de Welux
  placeholder.svg Imagen genérica mientras no haya fotos reales
_worker.js        Worker Pages: solo /api/checkout (Stripe), moneda EUR
_routes.json      Limita el worker a /api/*; el resto es estático
```

## Catálogo (87 productos, 10 categorías)

La tabla muestra el catálogo inicial (37 productos); después se añadieron
limpieza profesional y alquileres, herramientas y técnica, repuestos HORECA
(12), packs smart home configurados y packs de energía/red/AV. El catálogo
completo y actualizado está en `productos.json`.

| Categoría | Productos |
|---|---|
| Energía | Kit solar balcón 799 W, power station ~1000 Wh, power station ~500 Wh, panel solar portátil ~200 W |
| Persianas y calefacción | Motor Schellenberg 15 Nm, motor ARON 20 Nm, mando persiana, panel calefactor infrarrojo, panel calefactor 600 W |
| Smart home | Enchufe smart, pack bombillas + tira LED, cámara WiFi batería/solar, videoportero batería, válvula termostática radiador, cerradura smart Nuki, pack sensores, altavoz smart |
| Pantallas y AV | Smart display, marco fotos WiFi, monitor portátil USB-C, proyector smart portátil, Smart TV 43", pantalla señalización digital, dron cámara 4K, cámara acción + gimbal, kit Starlink |
| Red y oficina | Mesh WiFi 3 nodos, kit powerline PLC, repetidor WiFi, dock USB-C, webcam 4K, luz de streaming |
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

## Qué falta (antes de publicar)

1. **Precios de venta a confirmar** (87 productos) + margen por proveedor.
2. **Número de WhatsApp de Welux** en `app.js` (`WHATSAPP_NUMERO`).
3. **Fotos reales** de cada producto (ahora `img/placeholder.svg` en todos).
4. **Dominio** (p. ej. subdominio de weluxhub.com o dominio propio);
   de momento vive en `yoyocubano.github.io/tienda-welux/`; **decisión
   del dueño** si se le pone dominio propio.
5. **`STRIPE_SECRET_KEY`** en Pages (solo cuando el dueño lo decida).
6. Textos FR/EN (ahora solo español) y condiciones de venta / entrega /
   devoluciones (entrega «a convenir en Luxemburgo», sin prometer plazos).
7. IVA: las ventas suman a la franquicia < 35.000 €; revisar con el
   contable antes de vender.

## Cómo se vería

Portada limpia azul marino/blanco: buscador, 8 botones de categoría,
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
