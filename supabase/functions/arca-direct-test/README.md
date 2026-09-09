# Prueba aislada: ARCA directo desde Deno (sin TusFacturasAPP)

Objetivo: validar si se puede facturar contra ARCA (ex AFIP) directo desde una Supabase Edge
Function, usando la librería [`facturajs`](https://github.com/emilioastarita/facturajs), sin
depender de ningún intermediario. **No toca nada del código de facturación actual**
(`invoice-sale`, `tusfacturas-webhook`, `business_fiscal_settings`) — es una función separada y
descartable, solo para decidir si conviene migrar.

## Resultado final (actualizado 2026-08-25)

**Login WSAA + `FEDummy`: funcionan de punta a punta, confirmado en el Edge Runtime real.**
Hicieron falta dos parches chicos sobre `facturajs` (monkey-patch, sin forkear ni copiar
archivos — ver el detalle de cada uno más abajo):

1. **Reemplazo de la sincronización NTP** por la hora del sistema — `facturajs` sincronizaba la
   hora contra `time.afip.gov.ar` con un socket UDP crudo antes de cualquier login, y el Edge
   Runtime de Supabase no permite UDP (mata el worker entero, `503` vacío, sin logs).
2. **Reemplazo del cache de tokens en disco por un bucket de Supabase Storage** — `facturajs`
   cachea el token de WSAA en `/tmp`, pero cada invocación de la Edge Function puede aterrizar en
   un container nuevo sin ese archivo. Sin cache persistente, cada intento pedía un login nuevo, y
   WSAA rechaza eso mientras el token anterior siga vigente (`coe.alreadyAuthenticated`, ~12hs de
   validez). `Deno.openKv()` (la alternativa nativa, sin infraestructura propia) no está disponible
   en este Edge Runtime (`Deno.openKv is not a function`) — se usó un bucket privado en su lugar.

Con ambos parches, certificado de homologación real, `wsfe` autorizado al certificado, y con el
cache ya persistiendo el token entre invocaciones:

```json
{"ok":true,"step":"FEDummy","result":{"AppServer":"OK","DbServer":"OK","AuthServer":"OK"}}
```

**`FECAESolicitar`: funciona. Se emitió un CAE real de prueba en homologación.**

```json
{
  "FeCabResp": { "Cuit": 20421955965, "PtoVta": 2, "CbteTipo": 6, "Resultado": "A", "Reproceso": "N" },
  "FeDetResp": {
    "FECAEDetResponse": [{
      "Concepto": 1, "DocTipo": 99, "DocNro": 0,
      "CbteDesde": 1, "CbteHasta": 1, "CbteFch": "20260903",
      "Resultado": "A",
      "CAE": "86350843280712",
      "CAEFchVto": "20260913"
    }]
  }
}
```

Factura B, Consumidor Final sin datos, $1000 con IVA 21% desglosado ($826.45 neto + $173.55 IVA),
`CondicionIVAReceptorId: 5`. `Resultado: "A"` (Aprobado) tanto a nivel cabecera como detalle, CAE
de 14 dígitos y su fecha de vencimiento. **Ningún error de campos faltantes o mal formados** — el
payload armado (ver "Parche 3" abajo para el shape exacto) fue aceptado tal cual en el primer
intento que llegó a mandarse.

**El bloqueo real no era el punto de venta — era `FEParamGetPtosVenta` en sí.** Con la
configuración del punto de venta 00002 ya confirmada correcta por captura de AFIP (Sistema
Registral: "Factura Electrónica - Monotributo - Web Services"), `FEParamGetPtosVenta` **seguía**
devolviendo `Sin Resultados`. En vez de seguir esperando una propagación que evidentemente no iba
a llegar, se dejó de depender de esa consulta para elegir el punto de venta (ver "Parche 3") y se
usó directamente el 00002 confirmado por fuera — y con eso, `FECompUltimoAutorizado` y
`FECAESolicitar` respondieron con normalidad. Conclusión: **el ambiente de homologación de WSFEv1
no siempre refleja los puntos de venta reales del Sistema Registral de AFIP**, aunque el resto
(login, autorización del certificado, emisión de CAE) sí use la configuración real — es una
limitación/particularidad conocida de homologación, no un problema de cuenta ni de código.

**Recomendación**: la ruta directa a ARCA es **técnicamente viable de punta a punta**, confirmada
con un CAE real en homologación. Antes de decidir migrar `invoice-sale` a este camino (que sigue
sin tocarse) faltaría: validar Nota de Crédito (`FECAESolicitar` con `CbteTipo` de NC y
`CbtesAsoc`), y decidir cómo resolver en producción los tres riesgos de mantenimiento que quedan
documentados abajo (parches sobre una librería de terceros, y la falta de logs accesibles en este
entorno para debug futuro).

## Parche 1: reemplazo de la sincronización NTP

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
se llegó exactamente al mismo error (`coe.notAuthorized`, en su momento), que ocurre *después* de
que WSAA ya validó la firma — si el timestamp hubiera estado mal formado, el rechazo hubiera sido
antes, por un motivo distinto (típicamente algo como `cms.sign.invalid`). Se documenta igual
porque es una asunción frágil de la librería que podría morder en otro escenario (otro Edge
Runtime, otra config regional) — no hace falta actuar sobre esto ahora.

## Parche 2: cache de tokens en Supabase Storage

### El problema

`facturajs` cachea el token de WSAA en disco (`fs.writeFile`/`readFile` a `cacheTokensPath`).
Dentro de una misma invocación, `/tmp` sí es escribible en el Edge Runtime de Supabase — la
escritura nunca tiró error. El problema es otro: **`/tmp` no sobrevive entre invocaciones** (cada
una puede aterrizar en un container distinto, con `/tmp` vacío de nuevo). Sin el cache, cada
invocación intenta un login WSAA nuevo — y WSAA rechaza pedir un token nuevo mientras el anterior
siga vigente:

```
Error: ns1:coe.alreadyAuthenticated: El CEE ya posee un TA valido para el acceso al WSN solicitado
```

Esto se reprodujo tanto en Deno CLI local (con un cache local vacío a propósito) como en deploys
reales sucesivos de la Edge Function.

### Por qué Supabase Storage y no Deno KV ni una tabla

- **Deno KV** hubiera sido la opción más simple (nativa del runtime, sin crear ningún recurso
  nuevo) — pero no está soportada: `await Deno.openKv()` tira `TypeError: Deno.openKv is not a
  function` en este Edge Runtime (confirmado con una función mínima, deployada y descartada).
- **Una tabla de Postgres** hubiera sido la más simple de leer/escribir, pero implica tocar el
  esquema real (`public.*`) para algo que es pura infraestructura de esta prueba descartable — se
  descartó explícitamente para no cruzar ese límite.
- **Un bucket de Storage privado, exclusivo para esta prueba** (`arca-direct-test-cache`, `public:
  false`, creado por API — no hay subcomando en la CLI usada, `supabase storage`, para crear
  buckets, solo para operar sobre objetos) no toca ninguna tabla ni política RLS existente, y es
  tan fácil de borrar como de crear cuando esta prueba deje de hacer falta.

### Cómo se aplicó (mismo criterio que el parche de NTP)

`AfipSoap.getCredentialsCacheAll` (estático, usado para *leer* el cache) y
`AfipSoap.prototype.saveCredentialsCache` (de instancia, usado para *escribir*) son, en el JS
compilado, propiedades comunes y reasignables — mismo argumento que con `getNetworkHour`. Se
reemplazan por funciones que leen/escriben un único objeto JSON (`wsaa-tokens.json`) en el bucket,
vía un cliente de Supabase con service role (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, ambas
auto-inyectadas por la plataforma en toda Edge Function, igual que en `tusfacturas-webhook`):

```ts
(AfipSoap as unknown as { getCredentialsCacheAll: () => Promise<Record<string, unknown>> })
  .getCredentialsCacheAll = readTokenCache;

(AfipSoap.prototype as unknown as { saveCredentialsCache: (service: string, credential: unknown) => Promise<void> })
  .saveCredentialsCache = async function (service, credential) {
    const cache = await readTokenCache();
    cache[service] = credential;
    await writeTokenCache(cache);
  };
```

**Confirmado con deploy real**: una invocación hizo el login de red y guardó el token en el
bucket (verificado con `supabase --experimental storage ls -r ss:///arca-direct-test-cache/`); la
siguiente invocación, en un container nuevo, ya no chocó con `coe.alreadyAuthenticated` — reusó el
token cacheado. El mismo riesgo de mantenimiento que el parche de NTP aplica acá: si una versión
futura de `facturajs` renombra estos dos métodos, el parche deja de aplicar en silencio (mitigado
igual, con la versión fijada exacta).

### Costo de este parche si se abandona esta prueba

El bucket `arca-direct-test-cache` es un recurso real en el proyecto de Supabase (no cuesta nada
mientras esté casi vacío, pero es un recurso nuevo igual). Si se decide no seguir por el camino de
ARCA directo, borrarlo junto con esta función es limpieza recomendada, no obligatoria.

## Parche 3: `FEParamGetPtosVenta` no bloquea más la elección de punto de venta

No es un monkey-patch sobre `facturajs` como los otros dos — es un cambio en nuestro propio
código (`index.ts`). `FEParamGetPtosVenta` sigue devolviendo `Sin Resultados` incluso con el
punto de venta 00002 confirmado correctamente configurado por captura de pantalla del Sistema
Registral de AFIP ("Factura Electrónica - Monotributo - Web Services"). La conclusión, después de
haber agotado las explicaciones de configuración de cuenta, es que **el ambiente de homologación
de WSFEv1 no siempre refleja los puntos de venta reales** — un problema conocido del ambiente de
pruebas de AFIP, no de esta cuenta en particular.

Antes, un `FEParamGetPtosVenta` vacío bloqueaba toda la prueba (`return` temprano). Ahora es
puramente informativo: se intenta, se guarda su resultado (o su error) en `steps` para
diagnóstico, pero si no devuelve un punto de venta usable, se sigue con un valor conocido por
fuera (`PTO_VTA_FALLBACK = 2`, el punto de venta ya confirmado). Con este cambio,
`FECompUltimoAutorizado` y `FECAESolicitar` se ejecutaron con normalidad y devolvieron un CAE real
(ver "Resultado final") — confirma que el problema era específicamente de `FEParamGetPtosVenta`,
no de autorización ni de configuración del punto de venta en sí.

**Implicancia para `invoice-sale` si se migra**: no depender de `FEParamGetPtosVenta` en
producción tampoco — el punto de venta que vaya a usar cada negocio debería ser un dato que carga
el dueño a mano en Configuración (ya existe `business_fiscal_settings.afip_punto_venta` para
esto), no algo que se resuelva consultando este método en tiempo real.

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

### 3. Cómo se aisló el bloqueo de UDP (Parche 1)

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

### 4. Cómo se aisló el bloqueo del cache (Parche 2)

1. Con login+FEDummy ya confirmados, se armó el payload de `FECAESolicitar` (Factura B,
   Consumidor Final sin datos, `CondicionIVAReceptorId: 5` por la RG 5616, $1000 con IVA 21%
   desglosado), precedido por una consulta a `FEParamGetPtosVenta` (para no hardcodear ningún
   punto de venta).
2. Al reintentar en distintos momentos, apareció `coe.alreadyAuthenticated` — reproducido primero
   en una corrida local con un cache vacío a propósito, después en deploys reales consecutivos.
3. Se probó `Deno.openKv()` como alternativa nativa — no soportada en este Edge Runtime.
4. Se implementó el cache en un bucket de Storage (ver "Parche 2" arriba) — confirmado que
   persiste el token entre invocaciones reales.
5. Con el cache resuelto, `FEParamGetPtosVenta` seguía devolviendo `Sin Resultados` — se
   sospechó primero un problema de configuración de cuenta (el punto de venta 00002 se había dado
   de alta con el sistema equivocado, "Remito Electrónico", y se corrigió a "Factura Electrónica -
   Monotributo - Web Services").
6. Con la configuración ya confirmada correcta por captura de AFIP, `FEParamGetPtosVenta` seguía
   igual. Se dejó de depender de ese método (Parche 3) y se usó el punto de venta 00002
   directamente — `FECompUltimoAutorizado` y `FECAESolicitar` funcionaron de inmediato y
   devolvieron un CAE real, confirmando que el problema era específicamente de
   `FEParamGetPtosVenta` en homologación, no de la cuenta ni del resto del código.

### Endpoints usados (homologación)

- Login (WSAA): `https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl` (redirige internamente a
  `wsaaext0.homo.afip.gov.ar` / `wsaaext1.homo.afip.gov.ar`, según el intento)
- Servicio (WSFEv1): `https://wswhomo.afip.gov.ar/wsfev1/service.asmx?wsdl`

Ambos hardcodeados en `facturajs` (`src/lib/AfipSoap.ts`), no hace falta configurarlos.

## Cómo reproducir esta prueba

1. Certificado de homologación real: `openssl genrsa` + `openssl req -new` para el CSR, adherido
   en AFIP siguiendo el
   [PDF de AFIP](https://www.afip.gob.ar/ws/WSASS/WSASS_como_adherirse.pdf), y autorizado al web
   service `wsfe` desde esa misma gestión.
2. Un punto de venta dado de alta en AFIP (Registro Único Tributario → Puntos de venta) con
   sistema tipo "Web Service" (no "Factura en Línea" ni "Remito Electrónico" — son modos
   distintos, cada uno con sus propios puntos de venta).
3. El bucket de cache, si no existe (una sola vez):
   ```bash
   curl -X POST "https://<project-ref>.supabase.co/storage/v1/bucket" \
     -H "Authorization: Bearer <service role key>" -H "apikey: <service role key>" \
     -H "Content-Type: application/json" -d '{"name":"arca-direct-test-cache","public":false}'
   ```
4. `supabase secrets set ARCA_TEST_CERT="$(cat cert.pem)" ARCA_TEST_PRIVATE_KEY="$(cat private_key.key)"`
5. `supabase functions deploy arca-direct-test`
6. Invocar por HTTP directo (la CLI usada no tiene `functions invoke`):
   ```bash
   curl -X POST "https://<project-ref>.supabase.co/functions/v1/arca-direct-test" \
     -H "Authorization: Bearer <anon key>" -H "apikey: <anon key>"
   ```
