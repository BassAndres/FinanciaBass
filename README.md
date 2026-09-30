# FinanciaBass

App web instalable (PWA) para saber **cuánto puedes gastar hoy**, pagar tus tarjetas a tiempo y ahorrar lo que no uses.

- **Hoy puedes gastar $X:** lo que no gastes se acumula para mañana. Si te pasas, los días siguientes bajan y la app te dice cuándo te recuperas.
- **Tarjetas:** cortes, fechas límite (recorridas por días inhábiles CNBV), uso de tu límite y un plan para pagar lo antes posible sin quedarte sin dinero.
- **Ingresos y fijos que se repiten:** sueldo, beca, suscripciones y MSI. Los cargos automáticos se registran solos.
- **Captura rápida:** botones de Metro/Metrobús, atajos del ícono y registro automático de las notificaciones de tu banco con MacroDroid (Android).
- **Privacidad:** tus números viven **solo en tu celular** (localStorage) y nada se sube a internet. Haz respaldos desde *Más → Respaldo*.

## Cómo calcula

```
N          = efectivo + banco − lo que debes en tarjetas
libre      = N(día antes del periodo) + ingresos y gastos planeados − transporte apartado
disponible = lo que tienes hoy + lo planeado pendiente − (libre − libre·k/D)
```

Una compra con tarjeta cuenta como gasto el día que la haces, y pagar la tarjeta solo mueve dinero, así que nada se cuenta dos veces. El periodo va de día de pago a día de pago, y el primero puede ser más largo (un "periodo de rescate").

## Publicarla (GitHub Pages)

1. En GitHub: *Settings → Pages → Build and deployment → Deploy from a branch*.
2. Elige la rama y la carpeta `/ (root)`, y guarda.
3. Abre `https://<usuario>.github.io/FinanciaBass/` en Chrome (Android) → menú ⋮ → **Instalar app**.

## Cargar tus datos

- **Código de configuración** `FB1.…`: pégalo en la pantalla inicial o en *Más → Pegar código FB1*.
- También funciona como link: `https://…/FinanciaBass/#setup=FB1.…`

## Captura automática en Android (MacroDroid)

1. Instala **MacroDroid**.
2. Crea una macro con el disparador *Notificación recibida* de la app del banco.
3. Como acción usa *Abrir sitio web* con la URL que te da la app en *Más* (incluye tu token personal).
4. Lo del metro y metrobús se va a Transporte; lo demás queda "Por revisar". Las compras rechazadas y los pagos se ignoran.

## Desarrollo

```
npm test                      # pruebas del motor (node:test, datos inventados)
PLAYWRIGHT_MODULE=… npm run smoke   # prueba en Chromium: offline, captura por URL, etc.
npm run serve                 # servidor local en :8080
```

- JavaScript sin build. El motor (`js/engine/`) son funciones puras que trabajan en centavos.
- Cuando cambies un archivo, sube `VERSION` en `sw.js`.
- `test/private/` está en `.gitignore`: ahí van pruebas con datos reales. **Nunca** subas estados de cuenta ni números reales, porque este repo es público.
