# Prueba aislada: ARCA directo desde Deno (sin TusFacturasAPP)

Objetivo: validar si se puede facturar contra ARCA (ex AFIP) directo desde una Supabase Edge
Function, usando la librería [`facturajs`](https://github.com/emilioastarita/facturajs), sin
depender de ningún intermediario. **No toca nada del código de facturación actual**
(`invoice-sale`, `tusfacturas-webhook`, `business_fiscal_settings`) — es una función separada y
descartable, solo para decidir si conviene migrar.

## Resultado final (confirmado con deploy real, 2026-08-24)

**Funciona de punta a punta.** El bloqueo original (ver "Historia de la investigación" más abajo)
era que `facturajs` sincroniza la hora contra `time.afip.gov.ar` por NTP —usando un socket UDP
crudo— antes de firmar cualquier login, y el Edge Runtime de Supabase no permite UDP: en vez de
tirar un error de JS, mata el worker entero (`503`, body vacío, sin logs accesibles).

**El parche**: reemplazar esa sincronización NTP por la hora del sistema (`new Date()`), ya que la
infraestructura donde corre Supabase Edge Functions tiene su propio reloj sincronizado por el
proveedor cloud — no hace falta un round-trip NTP aparte contra un servidor específico de AFIP. Es
un monkey-patch de 3 líneas sobre `facturajs`, sin forkear nada. Ver la sección siguiente para el
detalle de cómo y por qué se implementó así.

**Con el parche aplicado, el certificado de homologación real, y una vez autorizado ese
certificado al web service `wsfe`** en el portal de AFIP (paso de cuenta que hacía falta además
de generar el certificado), la invocación final devolvió:

```json
{"ok":true,"step":"FEDummy","result":{"AppServer":"OK","DbServer":"OK","AuthServer":"OK"}}
```

HTTP 200. Es decir: login WSAA completo (token + sign obtenidos), llamada autenticada a WSFEv1
exitosa, y los tres subsistemas de AFIP (aplicación, base de datos, autenticación) responden
`OK`. Este resultado es idéntico en forma al que devuelve `facturajs` corriendo en un backend
Node tradicional — no hay ninguna degradación ni dato faltante por correr en el Edge Runtime de
Supabase.

Como paso intermedio, antes de tener el certificado autorizado a `wsfe`, la respuesta era:
```
Error: ns1:coe.notAuthorized: Computador no autorizado a acceder al servicio:
{"exceptionName":"gov.afip.desein.dvadac.sua.view.wsaa.LoginFault","hostname":"wsaaext0.homo.afip.gov.ar"}
```
(esto ya no es un problema técnico, era el estado esperado antes de autorizar el servicio — se
deja documentado porque es el mismo error que vería cualquiera que repita esta prueba antes de
completar ese paso de AFIP).

**Recomendación**: la ruta directa a ARCA **es técnicamente viable y está probada de punta a
punta en homologación**. El parche de NTP es la única modificación necesaria sobre `facturajs`, y
es chico y aislado. Si se quiere avanzar con esto (en vez de, o además de, TusFacturasAPP), el
siguiente paso natural es `FECAESolicitar` (emitir un comprobante real) contra homologación, y
recién ahí decidir si vale la pena migrar `invoice-sale` — que sigue sin tocarse — a este camino.
El riesgo pendiente de fondo sigue siendo el mismo: mantener el parche al día si `facturajs`
cambia de versión (mitigado con la versión fijada exacta, ver más abajo).

## Parche: reemplazo de la sincronización NTP

### Dónde está el punto exacto

En `facturajs`, el único lugar que llama a NTP es `AfipSoap.getNetworkHour()`
(`src/lib/AfipSoap.ts` del paquete), llamado desde `signService()` antes de firmar el XML de
login:

```ts
private async signService(service: string): Promise<string> {
    const date = await AfipSoap.getNetworkHour();  // <- acá
    const [cert, privateKey] = await this.getKeys();
    return signMessage(this.getLoginXml(service, date), cert, privateKey);
}

private static async getNetworkHour(): Promise<Date> {
    const timeSync = NtpTimeSync.getInstance({ servers: ['time.afip.gov.ar'] });
    const res = await timeSync.getTime();
    return res.now;
}
```

`getNetworkHour` es un método `private static` sin ningún flag de configuración para
desactivarlo o inyectar una fuente de hora alternativa.

### Por qué monkey-patch y no copiar el archivo (opción a) ni forkear el paquete (opción b)

Antes de tocar nada, inspeccioné el JS compilado que Deno realmente carga (`dist/lib/AfipSoap.js`,
ya en caché local de una prueba anterior). Confirmé algo clave: **`private` de TypeScript se
borra por completo al compilar** — no hay `#private` real (los "private fields" de JS moderno),
ni name-mangling. En el JS compilado, `getNetworkHour` es un método estático común y corriente
sobre el objeto de la clase `AfipSoap`, y `signService` lo llama como `AfipSoap.getNetworkHour()`
— una referencia viva a la clase, resuelta en cada llamada, no una copia congelada en tiempo de
compilación.

Eso significa que se puede **reasignar `AfipSoap.getNetworkHour` después de importar el módulo y
antes de la primera llamada**, sin copiar ni un archivo de `facturajs`:

```ts
import { AfipServices, AfipSoap } from "facturajs";

(AfipSoap as unknown as { getNetworkHour: () => Promise<Date> }).getNetworkHour = () =>
  Promise.resolve(new Date());
```

Comparado con lo que proponía el pedido original:

- **(a) Copiar la lógica de armado de login WSAA a nuestro código**: hubiera significado
  duplicar `getLoginXml` (formato exacto del XML que exige AFIP), `signMessage` (armado del CMS
  con `node-forge`, con sus atributos autenticados específicos), y la construcción del cliente
  SOAP con el override de cifrado TLS legacy (`ciphers: DEFAULT@SECLEVEL=1`, que AFIP exige y que
  costó varias vueltas descubrir en el propio README de `facturajs`). Eso es lógica real que
  mantener sincronizada a mano.
- **(b) Forkear el paquete completo**: mucho más código para cargar con cada `npm install`/bump
  de versión, y divergiría del paquete oficial en más de un lugar.
- **Monkey-patch**: 3 líneas, cero archivos de terceros tocados, cero lógica de AFIP duplicada.
  El único costo es que si una futura versión de `facturajs` renombra o reestructura
  `getNetworkHour`, el parche se vuelve un no-op silencioso y el bug de UDP volvería a aparecer
  sin aviso. Mitigado así:
  - La versión está **fijada exacta** en `deno.json` (`npm:facturajs@0.4.3`, no un rango) — no
    hay actualización silenciosa posible; subir de versión es una decisión explícita.
  - Si en algún momento se sube la versión, hay que releer `AfipSoap.ts` de la versión nueva y
    confirmar que el parche sigue aplicando al método correcto (o volver a correr esta misma
    prueba: si el 503 vacío vuelve a aparecer, es la primera señal de que el parche dejó de
    pegar).

### Otro riesgo encontrado en el camino (no bloqueante, pero real)

`getLoginXml` arma el timestamp de la firma así:

```ts
const formatDate = (date) => moment(date).format().replace('-03:00', '');
```

Esto asume que el proceso corre en huso horario de Argentina (`-03:00`) y lo saca del string a
mano — si el proceso corriera en otra zona horaria (UTC, típico en containers/cloud), ese
`.replace()` sería un no-op y el timestamp quedaría con un offset distinto al que
`facturajs`/AFIP esperan. En la práctica esto **no causó problema**: tanto en Deno CLI local
(huso horario `-03:00`, confirmado con `getTimezoneOffset()`) como en el deploy real a Supabase
se llegó exactamente al mismo error (`coe.notAuthorized`), que ocurre *después* de que WSAA ya
validó la firma — si el timestamp hubiera estado mal formado, el rechazo hubiera sido antes, por
un motivo distinto (típicamente algo como `cms.sign.invalid` o un error de fecha). Se documenta
igual porque es una asunción frágil de la librería que podría morder en otro escenario (otro
Edge Runtime, otra config regional) — no hace falta actuar sobre esto ahora.

### Riesgo de la cache de tokens en disco: descartado

`facturajs` escribe el token de WSAA en disco tras un login exitoso (`fs.writeFile` a
`cacheTokensPath`, apuntado a `/tmp/arca-direct-test-tokens.json`, sin try/catch alrededor). Con
el login ya completo (ver "Resultado final" arriba, respuesta `200 OK` con `FEDummy`), esta
escritura tuvo que ejecutarse igual — si `/tmp` no fuera escribible en el Edge Runtime, hubiera
aparecido como un error sin capturar en vez de la respuesta `ok:true`. Confirma que `/tmp` sí es
escribible en este entorno.

## Historia de la investigación (cómo se llegó hasta acá)

### 1. Import de `facturajs` vía `npm:` en Deno

Funcionó sin ningún workaround, tanto en Deno CLI local como en el bundler de Supabase (`esbuild`,
según el output de `supabase functions deploy`) — deployar una función que solo importa
`facturajs` sin usarla respondió `200 OK`. Se resolvieron todas las dependencias transitivas
(`soap`, `node-forge`, `xml2js`, `moment`, `ntp-time-sync`, `debug`, `xml-crypto`, `axios`, `sax`,
etc.) sin polyfills manuales.

### 2. `facturajs` no expone `FEDummy` sin login

`AfipServices.execRemote(...)` delega en `AfipSoap.execMethod(...)`, que *siempre* pide un token
(`getTokens()`) antes de invocar el método pedido — aunque `FEDummy` en la API real de AFIP no
necesita autenticación. No hay flag para saltear esto, así que probar `FEDummy` implica
necesariamente completar el login WSAA primero.

### 3. Cómo se aisló el bloqueo de UDP

1. Con un certificado inválido (`certContents: "dummy"`) en Deno CLI local: falló en la firma CMS
   (`Invalid PEM formatted message`), lo que confirmó que el paso *anterior* — la sincronización
   NTP — se completaba sin errores ahí.
2. Con un certificado autofirmado real (generado con `openssl`, sin pasar por AFIP) en Deno CLI
   local: todo el pipeline corrió de punta a punta — NTP, firma CMS, TLS con el cifrado legacy
   que exige AFIP, llamada real a `wsaahomo.afip.gov.ar` — y volvió un rechazo real y bien
   formado (`cms.cert.untrusted`, esperable porque el cert no era de AFIP).
3. Deployado a Supabase (sin parche todavía) con el certificado real: **`503` vacío**, sin llegar
   a nuestro propio `try/catch`.
4. Para aislar la causa sin acceso a logs (la versión de la CLI usada, `supabase` 2.109.1, no
   tiene `functions logs`), se deployaron dos variantes reducidas del archivo, una por vez:
   - Solo el import de `facturajs`, sin construir ni llamar nada → `200 OK`.
   - Solo `NtpTimeSync.getInstance({servers:['time.afip.gov.ar']}).getTime()`, con una carrera
     contra un `setTimeout` propio de 8 segundos → `503` vacío otra vez, en menos de 8 segundos
     (así se supo que el worker se cae de golpe, no que se cuelga esperando una respuesta).
5. Se confirmó en el código fuente de `ntp-time-sync` (`src/NtpTimeSync.ts` del paquete) que
   `getNetworkTime()` usa `dgram.createSocket("udp4")` — el socket UDP crudo, la causa raíz.

### Endpoints usados (homologación)

- Login (WSAA): `https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl` (redirige internamente a
  `wsaaext0.homo.afip.gov.ar` / `wsaaext1.homo.afip.gov.ar`, según el intento)
- Servicio (WSFEv1): `https://wswhomo.afip.gov.ar/wsfev1/service.asmx?wsdl`

Ambos hardcodeados en `facturajs` (`src/lib/AfipSoap.ts`), no hace falta configurarlos.

## Cómo reproducir esta prueba

1. Certificado de homologación real: `openssl genrsa` + `openssl req -new` para el CSR, adherido
   en AFIP siguiendo el
   [PDF de AFIP](https://www.afip.gob.ar/ws/WSASS/WSASS_como_adherirse.pdf), **y autorizado al
   web service `wsfe`** desde esa misma gestión (este último paso es el que falta en la prueba
   actual).
2. `supabase secrets set ARCA_TEST_CERT="$(cat cert.pem)" ARCA_TEST_PRIVATE_KEY="$(cat private_key.key)"`
3. `supabase functions deploy arca-direct-test`
4. Invocar por HTTP directo (la CLI usada no tiene `functions invoke`):
   ```bash
   curl -X POST "https://<project-ref>.supabase.co/functions/v1/arca-direct-test" \
     -H "Authorization: Bearer <anon key>" -H "apikey: <anon key>"
   ```
