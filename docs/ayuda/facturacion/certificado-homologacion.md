---
titulo: Certificado de ARCA para Faro (homologación y producción)
resumen: Cómo generar la clave privada y el pedido de certificado (CSR), obtener el certificado de homologación con una CUIT propia y cargarlo en el Faro Manager.
perfiles: [estudio]
modulo: arca
actualizado: 2026-10-11
relacionados: [facturacion/delegar-en-faro, facturacion/emitir-facturas]
---

Faro se autentica ante ARCA (WSAA) con el **certificado digital de la CUIT que lo opera**. Primero se prueba en **homologación** (ambiente de pruebas, sin validez fiscal) y después se pide el de **producción**. Esta guía es para el equipo de Faro (Faro Manager → Plataforma → ARCA).

## 1. Generar la clave privada y el CSR

En una computadora con OpenSSL:

```
openssl genrsa -out faro.key 2048
openssl req -new -key faro.key -subj "/C=AR/O=Faro/CN=faro-homologacion/serialNumber=CUIT 20XXXXXXXXX" -out faro.csr
```

Reemplazá `20XXXXXXXXX` por la CUIT que va a operar. **Guardá `faro.key` en un lugar seguro**: no se la mandes a nadie.

## 2. Certificado de homologación

1. Entrá a ARCA con la CUIT y su clave fiscal.
2. Adherí el servicio **WSASS - Autogestión Certificados Homologación** (desde «Administrador de Relaciones» si no aparece).
3. En WSASS, tocá **Nuevo certificado**, poné un nombre (por ejemplo, `faro-homologacion`) y pegá el contenido de `faro.csr`.
4. Copiá el certificado que devuelve y guardalo como `faro.crt`.
5. En WSASS → **Crear autorización a servicio**: autorizá el certificado para **wsfe** y para **ws_sr_constancia_inscripcion**.

## 3. Cargarlo en Faro

1. Faro Manager → **Plataforma → ARCA** → Homologación → **Cargar el certificado**.
2. Cargá la CUIT, `faro.crt` y `faro.key` (o pegá su contenido). Se guardan **cifrados** con `ENCRYPTION_KEY` y nunca vuelven al navegador.
3. Tocá **Probar la conexión**: tiene que mostrar los servidores OK y los tickets del WSAA para factura electrónica y constancia.

## 4. Producción

Cuando las pruebas den bien: generá otra clave y otro CSR, pedí el certificado en **Administración de Certificados Digitales** (producción), autorizalo para los mismos servicios, cargalo en **Producción** y cambiá el **ambiente activo**. Cambiar el ambiente afecta a todas las cuentas que facturan con Faro.

## Vencimiento

Los certificados vencen. El Faro Manager muestra la fecha en rojo cuando falta menos de un mes: renovalo antes.
