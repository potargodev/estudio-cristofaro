---
titulo: Contabilidad general en Faro
resumen: Plan de cuentas con plantilla por rubro, asientos automáticos y manuales con su origen, libro diario, mayor, sumas y saldos, estados contables, bienes de uso, cuentas corrientes, moneda extranjera y cierre del ejercicio.
perfiles: [estudio]
modulo: core
actualizado: 2026-10-13
relacionados: [conexiones/sistemas-conectados, empleados/liquidacion-de-sueldos, facturacion/emitir-facturas]
---

**Dónde está:** en la ficha de la organización → **Contabilidad**. La usan el dueño y los contadores del estudio.

## Plan de cuentas
La primera vez que entrás, Faro arma el plan con la **plantilla del rubro** de la organización (general, comercio, industria, gastronomía o agro). Podés sumar cuentas propias, marcar si son imputables o de título, si son monetarias (para el ajuste por inflación) y en qué moneda. Aplicar otra plantilla **suma** las cuentas que faltan y no borra nada.

Si la organización trabaja con Tango, Xubio o Contabilium, cada cuenta se puede **mapear** al código del otro sistema, para traducir sus asientos y para publicar los de Faro.

## Asientos
- **Automáticos:** con «Generar asientos del período» Faro arma un borrador por cada factura emitida (las notas de crédito invierten el asiento), cada compra confirmada (separa IVA crédito fiscal y percepciones de IVA, IIBB con su jurisdicción y Ganancias), cada liquidación de sueldos aprobada, cada cobro, cada pago conciliado y cada débito de impuestos bancarios o SIRCREB. Cada asiento guarda su **origen**; generar dos veces no duplica.
- **Manuales:** hasta ocho líneas, con detalle. Tiene que balancear y no se imputa a cuentas de título.
- **Modelos:** guardás un asiento como modelo (con o sin importes) y lo reusás.
- Los asientos nacen en **borrador** y se numeran al registrarlos, en orden y sin huecos. Si activaste el interruptor «Registrar asientos automáticos» en el Agente, se registran solos.

## Libros y estados
- **Libro diario**, **mayor** de una cuenta con saldo anterior, **balance de sumas y saldos** y **estados contables** (situación patrimonial y resultados). Faro controla que activo sea igual a pasivo más patrimonio neto.
- Todo se descarga en **Excel** y **PDF**.

## Bienes de uso, cuentas corrientes y moneda extranjera
- **Bienes de uso:** alta con costo, valor residual y vida útil; Faro calcula la amortización lineal y arma el asiento del período (uno solo por período).
- **Cuentas corrientes** de clientes y proveedores con antigüedad de saldos (al día, 1-30, 31-60, 61-90 y más de 90 días).
- **Moneda extranjera:** para las cuentas en dólares, cargás la cotización de cierre y Faro arma el asiento de diferencia de cambio en borrador.

## Cierre y reapertura
**Cerrar el ejercicio** registra la refundición de resultados, el asiento de cierre y la apertura del ejercicio siguiente, y bloquea el período: no se cargan ni anulan asientos con esas fechas. **Reabrir** pide el motivo, anula esos asientos y desbloquea; queda en la auditoría.

## Si la contabilidad la lleva otro sistema
Si en **Conexiones → Sistemas conectados** la contabilidad está en Xubio, Tango o Contabilium, Faro no genera asientos propios: muestra los del otro sistema, traducidos con el mapeo de cuentas, en los mismos libros y estados.

## Con el Vigía y el Agente
Podés pedir «mostrame el balance de sumas y saldos de X», «estados contables de X a diciembre» o «generá los asientos de marzo de X». Los asientos quedan en borrador para que el contador los revise.
