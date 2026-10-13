// Parte C · C7 · Guía de prueba para la contadora: recorridos cortos sobre la
// demo con todo en Simulador. Es la misma lista que docs/guia-prueba-contadora.md
// (se genera con `npm run guia`, que corre scripts/guia-a-md.mts) y la checklist de Faro Manager → Plataforma →
// Guía de prueba, donde cada prueba guarda su estado y un comentario.

interface GuideStep {
  key: string;
  area: string;
  title: string;
  /** Con qué usuario de la demo (Faro Manager → Demo → «Ver como…») */
  who: "Dueña de estudio" | "Contador" | "Autónomo" | "Dueña de organización" | "Empleada" | "Persona" | "Owner de Faro";
  steps: string[];
  expect: string;
}

export const GUIDE: GuideStep[] = [
  // ── Arranque ──
  { key: "inicio-demo", area: "Arranque", title: "Entrar a la demo y ver la marca", who: "Owner de Faro", steps: ["Faro Manager → Demo → Cargar la demo (si no está).", "«Ver como…» la dueña de estudio.", "Mirá la franja de arriba en cualquier pantalla."], expect: "Dice «Modo demostración» y que ARCA, Mercado Pago, WhatsApp, tiendas y bancos son simulados. Tiene el link a Simuladores." },
  { key: "modos", area: "Arranque", title: "Modo de cada servicio", who: "Owner de Faro", steps: ["Faro Manager → Plataforma → Integraciones.", "Elegí el estudio de la demo.", "Probá poner ARCA en Real."], expect: "Todo figura en Simulador «de siempre». Real no se puede en la demo (avisa por qué). El cambio a Prueba queda en la auditoría." },
  // ── Facturación ──
  { key: "empezar", area: "Facturación", title: "Empezar a facturar en 3 pasos", who: "Autónomo", steps: ["Facturación → banner «Empezá a facturar en 3 pasos».", "Guardá los datos, «Ya delegué: probar» y la factura de prueba."], expect: "Trae los puntos de venta del simulador (1 a 5) y la factura de prueba vuelve con CAE. En ningún paso pide la clave fiscal." },
  { key: "rapida", area: "Facturación", title: "Factura rápida (medí el tiempo)", who: "Autónomo", steps: ["Facturación → Factura rápida.", "Importe, un cliente reciente y Emitir.", "Cronometrá desde que abrís hasta ver el CAE."], expect: "Sale con CAE en pocos segundos, con «Sin validez fiscal» en el PDF. La auditoría guarda cuántos segundos tardó." },
  { key: "padron", area: "Facturación", title: "Cliente por CUIT (padrón)", who: "Autónomo", steps: ["En la factura rápida escribí una CUIT de 11 dígitos."], expect: "Completa nombre y condición frente al IVA desde el padrón simulado." },
  { key: "nota-credito", area: "Facturación", title: "Nota de crédito de una factura", who: "Contador", steps: ["Una organización → ARCA → una factura autorizada → Nota de crédito.", "Emitila."], expect: "Sale asociada a la factura, con su CAE; los totales del período bajan." },
  { key: "pdf", area: "Facturación", title: "PDF y QR", who: "Contador", steps: ["Abrí el PDF de una factura emitida en la demo."], expect: "Tiene CAE, vencimiento, QR y la marca «SIN VALIDEZ FISCAL» de fondo." },
  { key: "lote", area: "Facturación", title: "Lote de 500 facturas sin repetir", who: "Contador", steps: ["Facturación → Lotes → subir un CSV (hay un modelo para bajar).", "Revisá la vista previa y emití.", "Volvé a subir el mismo archivo."], expect: "Emite todas en orden; la segunda vez avisa que ya estaban y no duplica ninguna." },
  { key: "arca-caido", area: "Facturación", title: "ARCA caído y la cola", who: "Contador", steps: ["Simuladores → ARCA → Tirar ARCA.", "Emití una factura: queda «en cola» con el número previsto.", "Volvé a levantar ARCA y esperá un minuto (o recargá Facturación)."], expect: "La factura sale sola cuando ARCA vuelve y llega un aviso. No se pierde ni se duplica." },
  { key: "corte", area: "Facturación", title: "Respuesta cortada de ARCA", who: "Contador", steps: ["Simuladores → ARCA → Cortar la próxima respuesta.", "Emití una factura."], expect: "ARCA autorizó pero la respuesta no llegó: Faro la recupera consultando el comprobante y queda con su CAE, sin emitirla dos veces." },
  { key: "recurrentes", area: "Facturación", title: "Facturas recurrentes con interruptor", who: "Dueña de estudio", steps: ["Una organización → ARCA → Recurrentes: creá una mensual.", "Mirá si se emite sola o queda para aprobar."], expect: "Sin el interruptor de automatización, queda para aprobar. Con el interruptor (auditado y con pausa), sale sola." },
  { key: "libro-iva", area: "Facturación", title: "Libro IVA y posición del mes", who: "Contador", steps: ["Una organización → ARCA → Libro IVA: elegí período y CUIT.", "Bajá el Excel, el PDF y el ZIP del Libro IVA Digital."], expect: "Débito, crédito y saldo del mes y los 3 anteriores, con el semáforo. Los archivos tienen el formato de ARCA." },
  // ── Ventas, buzón, WhatsApp ──
  { key: "tienda-sin", area: "Ventas", title: "Venta de tienda sin el interruptor", who: "Contador", steps: ["Simuladores → Tiendas → una venta pagada.", "Facturación → Ventas de tiendas."], expect: "La venta aparece para facturar (no se factura sola). Se puede facturar o ignorar, y la existencia bajó en Stock." },
  { key: "tienda-con", area: "Ventas", title: "Venta de tienda con el interruptor", who: "Dueña de estudio", steps: ["Activá la automatización de tiendas para la organización.", "Simuladores → otra venta pagada.", "Simuladores → devolución con ese número de pedido."], expect: "La venta se factura sola; la devolución genera la nota de crédito." },
  { key: "telefono-factura", area: "WhatsApp", title: "Factura por audio desde el teléfono de prueba", who: "Contador", steps: ["Simuladores → Teléfono de prueba.", "Audio de prueba: «Facturale 40000 a Ana López por diseño».", "Respondé «SÍ»."], expect: "El Vigía arma la factura, pide confirmación y la emite al «SÍ». Sin confirmación, no sale." },
  { key: "telefono-ticket", area: "WhatsApp", title: "Gasto con foto del ticket", who: "Contador", steps: ["Teléfono de prueba: «Pagué 8500 de nafta».", "Mandá una foto de un ticket."], expect: "Queda el gasto con el comprobante, para aprobar en Rendiciones y en el Buzón." },
  { key: "buzon-otra-cuit", area: "Buzón", title: "Comprobante a nombre de otra CUIT", who: "Contador", steps: ["Operación → Buzón.", "Subí una factura recibida a nombre de otra CUIT (o mandala por el teléfono)."], expect: "La marca «Receptor distinto» y no la computa sola: decide una persona." },
  { key: "buzon-arca", area: "Buzón", title: "Importar Mis Comprobantes", who: "Contador", steps: ["Buzón → Importar el CSV de Mis Comprobantes de ARCA (dos veces)."], expect: "Entran los recibidos con su CAE validado; la segunda vez no repite ninguno." },
  // ── Contabilidad ──
  { key: "nucleo-tango", area: "Contabilidad", title: "Núcleo con Tango", who: "Dueña de estudio", steps: ["Simuladores → Conectar Tango simulado.", "Emití una factura: va a Tango.", "Simuladores → «Cambian el último comprobante» y sincronizá."], expect: "Lo que cambió en Tango llega como conflicto para resolver: Faro no pisa nada solo." },
  { key: "nucleo-xubio", area: "Contabilidad", title: "Núcleo con Xubio, Contabilium o sin sistema", who: "Dueña de estudio", steps: ["Simuladores → Conectar Xubio y Contabilium simulados.", "Cargá una venta «del otro lado» y sincronizá desde Conexiones.", "Probá una organización sin sistema (todo por archivos)."], expect: "Las ventas y compras quedan en el núcleo con su fuente, fecha e ID externo. Sin sistema funciona igual por archivos." },
  { key: "migracion", area: "Contabilidad", title: "Migración con totales", who: "Dueña de estudio", steps: ["Una organización → Sistemas → importar el histórico.", "Compará los totales que muestra Faro con los del sistema."], expect: "Muestra los totales importados por período y avisa si no coinciden." },
  { key: "balance", area: "Contabilidad", title: "Balance que cierra", who: "Contador", steps: ["Una organización → Contabilidad → Balance.", "Mirá el control de cuadre."], expect: "Activo = Pasivo + PN; si algo no cierra, dice qué asiento lo descuadra." },
  { key: "ajuste", area: "Contabilidad", title: "Ajuste por inflación con RECPAM", who: "Contador", steps: ["Contabilidad → Ajuste por inflación del ejercicio.", "Revisá los coeficientes y el RECPAM."], expect: "Propone el asiento con el RECPAM y queda para aprobar." },
  { key: "conciliacion", area: "Contabilidad", title: "Conciliación con extracto simulado", who: "Contador", steps: ["Simuladores → Banco → Bajar el extracto.", "Organización → Conciliación → importalo."], expect: "Cruza los cobros con las facturas (con tolerancia de centavos) y separa comisiones e impuesto al débito y crédito." },
  // ── Cartera y cobros ──
  { key: "recategorizacion", area: "Cartera", title: "Recategorización de 30 clientes", who: "Dueña de estudio", steps: ["Operación → Recategorización.", "Revisá la propuesta de la cartera."], expect: "Muestra quién sube, baja o queda igual con sus números; nada se presenta sin aprobación." },
  { key: "cobro-mp", area: "Cobros", title: "Honorarios con Mercado Pago simulado", who: "Dueña de estudio", steps: ["Honorarios → generá el link de pago de una organización.", "Simuladores → Mercado Pago → Abrir → Pagar.", "Probá también «Simular un rechazo»."], expect: "El pago aprobado marca la cuenta como cobrada (el aviso llega firmado). El rechazo no la marca." },
  { key: "mails", area: "Cobros", title: "Mails que hubieran salido", who: "Dueña de estudio", steps: ["Invitá a alguien o mandá un recordatorio.", "Simuladores → Mails que hubieran salido."], expect: "El mail no sale a nadie: queda en la bandeja del simulador con su asunto y destinatario." },
  // ── Portal y aislamiento ──
  { key: "portal", area: "Portal", title: "El portal de la organización", who: "Dueña de organización", steps: ["«Ver como…» la dueña de organización.", "Comprobantes → subí uno. Vencimientos y Solicitudes."], expect: "Ve solo lo de su empresa y la marca del estudio «Con tecnología de Faro»." },
  { key: "aislamiento", area: "Seguridad", title: "Aislamiento forzando IDs", who: "Contador", steps: ["Abrí una factura de una organización.", "Cambiá el ID de la URL por el de otro estudio (te lo pasa el equipo de Faro)."], expect: "No la muestra («no encontrado») y el intento queda en la auditoría." },
  { key: "api", area: "Integraciones", title: "API y webhooks", who: "Dueña de estudio", steps: ["Configuración → API y webhooks → creá un token con alcance de lectura.", "Abrí /api/v1/docs."], expect: "El token se ve una sola vez; la documentación lista los endpoints. Un token de lectura no puede emitir." },
];

/** Estados de cada prueba en la checklist */
export const GUIDE_STATUS = { pendiente: "Sin probar", ok: "Anda bien", falla: "Falla", duda: "Tengo dudas" } as const;
export type GuideStatus = keyof typeof GUIDE_STATUS;
export const isGuideStatus = (s: string): s is GuideStatus => s in GUIDE_STATUS;

/** Los huecos de docs/cobertura-tareas-contables.md («Agujeros para la reunión con la contadora»): cierran la guía */
export const GAPS = [
  "Ingresos Brutos y Convenio Multilateral (CM03, CM05 y coeficientes), SIRCREB y agentes provinciales.",
  "Altas y bajas de empleados (Simplificación Registral), ART, Ganancias 4.ª categoría y SIRADIG.",
  "DDJJ anuales de Ganancias y Bienes Personales, con sus anticipos.",
  "Domicilio Fiscal Electrónico: control de notificaciones.",
  "Planes de pago y moratorias.",
  "Retenciones y percepciones practicadas (SICORE/SIRE).",
  "Personal de casas particulares.",
  "Contabilidad completa del cierre: previsiones, estados completos con notas y anexos.",
  "Certificado MiPyME.",
  "Societario: libros, actas, IGJ, beneficiarios finales.",
  "Tasas municipales e impuesto de sellos.",
  "Informes para bancos y proyecciones financieras.",
];
