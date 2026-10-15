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
- **Android y iPhone:** se instala desde Chrome o Safari ("Agregar a pantalla de inicio"). En Android también hay una app (ver abajo).
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

## App de Android

`android/` es una app mínima en Java (unos 150 KB). Es la misma app web dentro de un WebView, con tus datos guardados en el celular, más un `NotificationListenerService`:

- Lee las notificaciones de Google Wallet y de las apps de banco que elijas, y las guarda en una cola local.
- La página las anota la siguiente vez que abres la app, con `window.FBAndroid.pending()` y `ack()`. **No abre el navegador** ni manda nada a internet.
- La interfaz se actualiza sola, porque carga `https://bassandres.github.io/FinanciaBass/`.
- Cada cambio deja una copia en `Descargas/FinanciaBass`, que sobrevive aunque desinstales la app.
- El APK firmado está en `descargas/FinanciaBass.apk`. Para pasar tus datos, en el navegador usa *Copiar mis datos* y en la app *Pegar mis datos*.

Para compilar (JDK 17+, Gradle 8.13+ y el SDK con `platforms;android-35` y `build-tools;35.0.0`):

```
cd android
echo "sdk.dir=/ruta/al/android-sdk" > local.properties
FB_KEYSTORE=/ruta/financiabass-firma.p12 FB_KEYSTORE_PASS=… gradle assembleRelease
```

La llave de firma **no** está en el repo. Para que una versión nueva se instale encima de la anterior hay que firmarla con la misma llave.

## iPhone

En iPhone se usa como app web instalada (no hace falta App Store ni Mac):

1. Abre `https://bassandres.github.io/FinanciaBass/` en Safari.
2. Toca **Compartir** (en iOS 26 está dentro de **⋯**) → **Agregar a pantalla de inicio**, deja activado **Abrir como app web** si aparece, y toca **Agregar**.
3. Ábrela siempre desde ese ícono. Ahí tus datos no se borran; en una pestaña de Safari, iOS borra los datos de un sitio que no abres en 7 días.

La app del ícono guarda sus datos aparte de Safari y empieza vacía. Si ya la usabas en Safari (o en Android), toca *Más → Respaldo → Copiar mis datos* y en la app del ícono toca **Pegar mis datos**.

Las compras con Apple Pay se capturan con una automatización de Atajos (ver abajo) y se pegan con el botón **Pegar compra** de Hoy. Cada compra conserva la fecha en que pagaste.

Una app nativa de iPhone, como la de Android, necesita una Mac con Xcode y una cuenta de desarrollador de Apple (USD 99 al año). Sin cuenta de pago, la app instalada desde Xcode deja de abrir a los 7 días.

## Captura automática

Las instrucciones paso a paso, con tu dirección personal (incluye un token), están en *Más → Captura automática*.

- **Android:**
  - **[Automate](https://llamalab.com/automate/)** (gratis, recomendada): bloques *Notification posted* (Google Wallet o tu banco), *Expression true* (solo compras), *Variable set* con `urlEncode()` y *App start* (View + Data URI).
  - Alternativas: **Automation** (código abierto, F-Droid), **MacroDroid Pro** y **Tasker** (de pago).
  - Todas necesitan "Mostrar sobre otras apps" y batería "Sin restricciones" para abrir la app cuando estás en otra.
  - Plantilla de la dirección: `?via=wallet|bank&id=<único>&k=<token>&t=<título>&raw=<texto>`. `raw` va al final para que un `&` o `#` sin codificar no corte el texto.
- **iPhone (Atajos):** el disparador es la automatización *Transacción*. Las acciones son *Texto* `FB|[Monto]|[Comerciante]|[Tarjeta]|[Fecha actual]` y *Copiar al portapapeles*. iOS no deja que un atajo abra una app web instalada, por eso se pega con un toque. La fecha se entiende en el formato del iPhone (`15/10/26 14:32`, `15 oct 2026`, ISO…).
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
