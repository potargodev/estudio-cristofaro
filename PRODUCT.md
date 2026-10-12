# Product

<!-- impeccable:product-schema 1 -->

> Escrito por `/impeccable init` a partir de CLAUDE.md, `docs/principios-producto.md`, `docs/faro-producto.md` y el código (octubre 2026). El dueño pidió trabajar sin preguntas: todo lo de acá sale de esos documentos; lo que no está decidido figura como abierto. Si algo choca con esos documentos, mandan ellos.

## Platform

web (Next.js, mobile first; PWA instalable para Faro y para el portal de cada estudio)

## Users

- **Personas** (en relación de dependencia o sin actividad): llevan sus finanzas en la Bitácora y comparten gastos en cajas compartidas y Grupos. Casi siempre desde el celular, en momentos cortos (cargar un gasto, mirar el mes).
- **Autónomos y monotributistas sin contador:** Faro Personal (caja de negocio, facturación con ARCA, semáforo de monotributo, sueldo del dueño). Necesitan orden y datos, no consejos fiscales.
- **Estudios contables y contadores independientes** (dueño, contador, colaborador): administran su cartera de organizaciones, vencimientos, documentos, solicitudes, honorarios, sueldos y cuentas conectadas. Trabajo diario de escritorio, denso, repetitivo, con muchas tablas.
- **Organizaciones** (empresas clientes de un estudio, 5 a 30 empleados, dueños sin área administrativa): ven vencimientos, documentos y solicitudes en el portal con la marca del estudio.
- **Empleados** de esas organizaciones: firman recibos y rinden gastos, casi siempre desde el celular.
- **Equipo de Faro** (Faro Manager): tenants, planes, catálogo, escudo, auditoría, cuentas de la plataforma (ARCA, Mercado Pago, WhatsApp) y la demo, con «Ver como…» sobre sus usuarios.

## Product Purpose

Faro es la plataforma de gestión para estudios contables y autónomos: «tu gestión y tus finanzas, a la vista». Ordena, automatiza y conecta; capturar una vez, completar solo y pedir únicamente confirmación. Éxito: que una persona sepa dónde está su plata sin esfuerzo, que un autónomo tenga su actividad en orden y que un estudio trabaje sobre datos vivos de sus clientes en vez de pedir papeles.

## Positioning

- **Faro hace, nunca dice que está bien** (principio madre): muestra datos y ejecuta lo que la persona aprueba; el criterio profesional es del contador matriculado.
- **Conexión, no copia:** el dato es del usuario; un estudio se conecta por permiso, revocable, y trabaja en vivo.
- Hecho por contadores (Estudio Cristofaro es el cliente cero), pero Faro no es un estudio ni compite con ellos.

## Operating Context

- Cuatro espacios con un solo esqueleto de navegación (§2.o): Personal, Estudio, Organización (portal) y Faro Manager; barra superior fija con Vigía, Mensajes, avisos, ayuda y cuenta; barra inferior en el celular.
- El Vigía (asistente con IA) propone y una persona aprueba.
- Integraciones: ARCA (facturación), Tango (dos sentidos o archivos), Xubio, Google Drive y Calendar, Mercado Pago, WhatsApp.
- Staging en app.estudiocristofaro.com, que usa Estudio Cristofaro con datos reales.

## Capabilities and Constraints

- Multi-tenant estricto; toda acción sensible auditada; archivos privados solo por rutas autenticadas.
- Interfaz en español rioplatense (voseo); lenguaje simple para clientes, preciso para el estudio.
- Modo claro y oscuro en toda la app; `prefers-reduced-motion` respetado.
- Abiertos (no decidir en diseño): publicar calificaciones, nombre definitivo de la Red Contable, renombrar Bitácora/Vigía/Flotas, estudios jurídicos en la Red.

## Brand Commitments

- Marca Faro: sello de Estudio Cristofaro + «FARO» en Bodoni Moda 800 con tracking amplio.
- Colores: azul noche #1c2235, rosé #a57c6d (el «dorado» de la marca es este oro rosa, nunca un amarillo), pizarra.
- Tipografía: títulos en Gilda Display (elegida por el cliente), textos en Archivo, números en Archivo tabular.
- App: clase `app-ui`, sidebar siempre oscuro, esquinas sutiles (6 px), fondo `bg-canvas`. Web pública: dirección «Precisión» (recta y oscura, sin radios).
- El portal de una organización lleva la marca del estudio y «Con tecnología de Faro».

## Evidence on Hand

- Estudio Cristofaro es el único tenant real; no hay testimonios, métricas ni clientes de Faro publicables más allá de eso. No inventar ninguno.
- Datos de demostración: solo en espacios marcados como demo (`is_demo`, mails `@demo.faro.local`), un mundo que nunca se cruza con los datos reales (`docs/demo.md`).

## Product Principles

1. Faro muestra y hace; no valida ni aconseja lo fiscal.
2. Lo personal es de la persona: nada se reporta sin permiso.
3. Una carga, varios destinos; nunca dos veces lo mismo.
4. La IA propone, una persona aprueba.
5. Un espacio a la vez, secciones que crecen hacia adentro.

## Accessibility & Inclusion

WCAG 2.2 AA como piso: contraste en claro y oscuro, foco visible, objetivos táctiles de 44 px en el celular, movimiento reducido respetado. Muchos usuarios no son técnicos: textos simples y sin jerga.
