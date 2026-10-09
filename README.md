# FinanciaBass

App web instalable (PWA) para saber **cuánto puedes gastar hoy**, pagar tus tarjetas a tiempo y ahorrar lo que no uses.

- **Hoy puedes gastar $X:** lo que no gastes se acumula para mañana. Si te pasas, los días siguientes bajan y la app te dice cuándo te recuperas.
- **Tarjetas:** cortes, fechas límite (recorridas por días inhábiles CNBV), uso de tu límite y un plan para pagar lo antes posible sin quedarte sin dinero.
- **Ingresos y fijos que se repiten:** sueldo, beca, suscripciones y MSI. Los cargos automáticos se registran solos.
- **Para cualquier persona:** un asistente de bienvenida arma tu plan (cuentas, efectivo, tarjetas con su corte y fecha límite, ingresos, gastos fijos y transporte). Te pueden pagar a fin de mes, un día fijo, por quincena, por semana o cada 2 semanas.
- **Captura automática:**
  - **Android:** una app de automatización gratis (Automate) o de código abierto (Automation) lee la notificación de **Google Wallet**, que llega al instante al pagar, y la del banco, para compras en línea. Si llegan las dos, la compra se registra una sola vez.
  - **iPhone:** una automatización de Atajos (*Transacción* de Wallet) copia cada pago con Apple Pay, y en la app tocas **Pegar compra**.
  - Los últimos 4 dígitos de cada tarjeta dicen con cuál pagaste.
- **Android y iPhone:** se instala desde Chrome o Safari ("Agregar a pantalla de inicio").
- **Privacidad:** tus números viven **solo en tu celular** (localStorage) y nada se sube a internet. Haz respaldos desde *Más → Respaldo*.

## Cómo calcula

```
N          = efectivo + banco − lo que debes en tarjetas
libre      = N(día antes del periodo) + ingresos y gastos planeados − transporte apartado
disponible = lo que tienes hoy + lo planeado pendiente − (libre − libre·k/D)
```

Una compra con tarjeta cuenta como gasto el día que la haces, y pagar la tarjeta solo mueve dinero, así que nada se cuenta dos veces. El periodo va de un día de pago al siguiente (configurable), y el primero puede ser más largo (un "periodo de rescate"). El colchón mínimo que dejas en tu cuenta no se reparte.

## Publicarla (GitHub Pages)

1. En GitHub: *Settings → Pages → Build and deployment → Deploy from a branch*.
2. Elige la rama y la carpeta `/ (root)`, y guarda.
3. Abre `https://<usuario>.github.io/FinanciaBass/` en Chrome (Android) → menú ⋮ → **Instalar app**.

## Empezar

- **Persona nueva:** abre la app y sigue el asistente. Todo se puede editar después en *Más → Editar*.
- **Respaldo:** en la pantalla inicial toca *Restaurar un respaldo*.
- **Código de configuración** `FB1.…`: también se acepta en la pantalla inicial o como link `https://…/FinanciaBass/#setup=FB1.…`.

## Captura automática

Las instrucciones paso a paso, con tu dirección personal (incluye un token), están en *Más → Captura automática*.

- **Android:**
  - **[Automate](https://llamalab.com/automate/)** (gratis, recomendada): bloques *Notification posted* (Google Wallet o tu banco), *Expression true* (solo compras), *Variable set* con `urlEncode()` y *App start* (View + Data URI).
  - Alternativas: **Automation** (código abierto, F-Droid), **MacroDroid Pro** y **Tasker** (de pago).
  - Todas necesitan "Mostrar sobre otras apps" y batería "Sin restricciones" para abrir la app cuando estás en otra.
  - Plantilla de la dirección: `?via=wallet|bank&id=<único>&k=<token>&t=<título>&raw=<texto>`. `raw` va al final para que un `&` o `#` sin codificar no corte el texto.
- **iPhone (Atajos):** el disparador es la automatización *Transacción*. Las acciones son *Texto* `FB|[Monto]|[Comerciante]|[Tarjeta]|[Fecha actual]` y *Copiar al portapapeles*. iOS no deja que un atajo abra una app web instalada, por eso se pega con un toque.
- Las compras rechazadas y los pagos recibidos se ignoran. Lo que parece transporte va al apartado de transporte; lo demás queda en "Por revisar".

## Desarrollo

```
npm test                      # pruebas del motor (node:test, datos inventados)
PLAYWRIGHT_MODULE=… npm run smoke   # prueba en Chromium: offline, captura por URL, etc.
npm run serve                 # servidor local en :8080
```

- JavaScript sin build. El motor (`js/engine/`) son funciones puras que trabajan en centavos.
- Cuando cambies un archivo, sube `VERSION` en `sw.js`.
- `test/private/` está en `.gitignore`: ahí van pruebas con datos reales. **Nunca** subas estados de cuenta ni números reales, porque este repo es público.
