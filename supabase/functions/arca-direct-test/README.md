# Prueba aislada: ARCA directo desde Deno (sin TusFacturasAPP)

Objetivo: validar si se puede facturar contra ARCA (ex AFIP) directo desde una Supabase Edge
Function, usando la librería [`facturajs`](https://github.com/emilioastarita/facturajs), sin
depender de ningún intermediario. **No toca nada del código de facturación actual**
(`invoice-sale`, `tusfacturas-webhook`, `business_fiscal_settings`) — es una función separada y
descartable, solo para decidir si conviene migrar.

## Qué se probó y qué encontré

### 1. Import de `facturajs` vía `npm:` en Deno

Funcionó **sin ningún workaround**. Corrí esto en Deno 2.9.5 local (`deno run --allow-net
--allow-read --allow-env --allow-sys`):

```ts
import { AfipServices, AfipSoap } from "npm:facturajs@0.4.3";
```

Se resolvieron sin errores todas las dependencias transitivas (`soap`, `node-forge`, `xml2js`,
`moment`, `ntp-time-sync`, `debug`, `xml-crypto`, `axios`, `sax`, etc.) — Deno las bajó de npm y
las cacheó como cualquier paquete Node. No hizo falta ningún polyfill ni `Deno.env` shim manual.

### 2. Llamada real a `FEDummy` vía `execRemote`

Importante: **`facturajs` no expone una forma de llamar `FEDummy` sin autenticarse primero.**
`AfipServices.execRemote(...)` delega en `AfipSoap.execMethod(...)`, que *siempre* llama primero
a `getTokens()` (login WSAA completo) antes de invocar el método pedido — aunque `FEDummy` en la
API real de AFIP no necesita autenticación. No hay ningún flag para saltear esto.

Hice dos pruebas, ambas con `homo: true`:

**a) Con un certificado inválido** (`certContents: "dummy"`): el pipeline llegó hasta el paso de
firma CMS (`node-forge`) y falló recién ahí con `Invalid PEM formatted message`. Esto confirma
que el paso previo — la sincronización NTP contra `time.afip.gov.ar` (vía `ntp-time-sync`, que
usa sockets UDP) — **se completó sin errores** en el entorno de Deno CLI local.

**b) Con un certificado autofirmado real** (generado con `openssl genrsa` + `openssl req -x509`,
sin pasar por AFIP): el pipeline completo — NTP, firma CMS, construcción del cliente SOAP,
handshake TLS con el cifrado legacy que exige AFIP (`ciphers: DEFAULT@SECLEVEL=1`), llamada de
red real a `wsaahomo.afip.gov.ar` (que redirigió a `wsaaext1.homo.afip.gov.ar`) — se ejecutó
de punta a punta. La respuesta fue un **rechazo real y bien formado de ARCA**:

```
Error: ns1:cms.cert.untrusted: Certificado no emitido por AC de confianza:
{"exceptionName":"gov.afip.desein.dvadac.sua.view.wsaa.LoginFault","hostname":"wsaaext1.homo.afip.gov.ar"}
```

Es decir: **todo el camino hasta ARCA funciona correctamente en Deno**. El único motivo del
rechazo es que el certificado usado no fue emitido por AFIP (era autofirmado, a propósito, para
esta prueba) — con un certificado de homologación real debería devolver el ticket de acceso
(`loginCmsReturn` con `token`/`sign`), y de ahí sí se podría llamar `FEDummy` (u otro método)
autenticado.

### 3. Endpoints usados (homologación)

- Login (WSAA): `https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl` (redirige internamente
  a `wsaaext1.homo.afip.gov.ar`)
- Servicio (WSFEv1): `https://wswhomo.afip.gov.ar/wsfev1/service.asmx?wsdl`

Ambos hardcodeados en `facturajs` (`src/lib/AfipSoap.ts`), no hace falta configurarlos.

## Riesgos que NO pude verificar (Deno CLI local ≠ Supabase Edge Runtime)

Todo lo de arriba lo corrí con el **Deno CLI completo** en esta máquina (lo instalé para esta
prueba, no estaba disponible antes). El runtime real de Supabase Edge Functions es un Deno
*sandboxeado*, con menos permisos que el CLI — así que hay dos puntos concretos que solo se
confirman deployando esta función de verdad:

1. **`ntp-time-sync` usa sockets UDP** para hablar el protocolo NTP contra `time.afip.gov.ar`.
   `facturajs` llama esto de forma **incondicional** antes de firmar (no hay config para
   desactivarlo). Muchos runtimes de Edge Functions (Deno Deploy y derivados) **no permiten UDP
   crudo**, solo TCP/HTTP saliente. Si Supabase Edge Runtime lo bloquea, el login va a fallar o
   colgarse ahí, con un error de permisos de Deno (`NotCapable` o similar) — no vas a ver un
   error de ARCA, vas a ver un error del runtime.
2. **`facturajs` cachea el token de WSAA en disco** (`fs.writeFile` a `cacheTokensPath`, acá
   apuntado a `/tmp/...`). Si el Edge Runtime no permite escritura ni siquiera en `/tmp`, el
   *login* puede salir bien pero la función igual tira un error al intentar guardar el cache
   (ese `writeFile` no está protegido con try/catch en la librería). Si ves un error de sistema
   de archivos *después* de que el log muestre que ARCA ya respondió, es esto, no un problema de
   autenticación.

**Conclusión**: el código de la librería en sí es compatible con Deno (correctamente empaquetado
en JS/TS puro + `node-forge`, sin nada que dependa de bindings nativos). La duda real no es
"¿funciona en Deno?" — funciona — sino "¿el sandbox específico de Supabase Edge Functions permite
UDP saliente y escritura en `/tmp`?". Eso solo se responde deployando esta función.

## Qué necesito que generes para probar el login completo

1. Clave privada + CSR (mismo comando que menciona el propio README de `facturajs`):
   ```bash
   openssl genrsa -out private_key.key 2048
   openssl req -new -key private_key.key \
     -subj "/C=AR/O=TU_EMPRESA/CN=TU_SISTEMA/serialNumber=CUIT TU_CUIT_SIN_GUIONES" \
     -out afip.csr
   ```
   (Ojo: literal la palabra `CUIT` seguida de un espacio y tu CUIT sin guiones en el `serialNumber`.)

2. Adherirte al servicio de homologación en AFIP con ese `afip.csr` (instrucciones en el
   [PDF de AFIP](https://www.afip.gob.ar/ws/WSASS/WSASS_como_adherirse.pdf) — te van a devolver
   un certificado, guardalo como `cert.pem`) y autorizar ese certificado al web service `wsfe`
   desde la misma página.

3. Cargar los dos archivos como **secrets** de Supabase (nunca los subas al repo ni me los pegues
   en el chat — son credenciales fiscales):
   ```bash
   supabase secrets set ARCA_TEST_CERT="$(cat cert.pem)"
   supabase secrets set ARCA_TEST_PRIVATE_KEY="$(cat private_key.key)"
   ```

4. Deployar y llamar la función:
   ```bash
   supabase functions deploy arca-direct-test
   supabase functions invoke arca-direct-test
   ```

Con eso vamos a ver, en un solo llamado, si ARCA acepta el login (y con eso los dos riesgos de
arriba quedan confirmados o descartados de una vez).
