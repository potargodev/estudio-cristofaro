---
titulo: Conectar Faro desde Claude, ChatGPT u otro cliente MCP
resumen: Usá Faro desde tu IA favorita con un acceso MCP que tiene los permisos de tu rol, alcances elegidos, vencimiento y revocación al instante.
perfiles: [estudio, autonomo, persona]
modulo: ai
actualizado: 2026-10-10
relacionados: [ia/ia-y-aprobaciones, conexiones/conexiones]
---

MCP es un estándar que permite que una IA externa use las herramientas de Faro. Con un acceso MCP podés preguntarle a Claude o a ChatGPT por tus vencimientos o tus solicitudes sin salir de esa app.

## Dónde está

En el menú, entrá a **Accesos MCP**. Ahí está la **URL del servidor MCP** (Streamable HTTP) y las instrucciones para cada cliente.

## Conectar con OAuth (recomendado)

**Claude (claude.ai o la app):**

1. Andá a Configuración → Conectores → Agregar conector personalizado.
2. Nombre: Faro. URL: la que ves en **Accesos MCP**.
3. Tocá conectar: se abre Faro, entrás con tu usuario y elegís los alcances. No hace falta token.

**ChatGPT:**

1. Andá a Configuración → Apps y conectores → Modo desarrollador → Crear.
2. Pegá la URL del servidor MCP y elegí OAuth como autenticación.
3. Al conectar, autorizás en Faro y elegís los alcances.

**Claude Code:** con OAuth (se abre el navegador al usar /mcp) o con un token.

## Crear un acceso con token

Para otros clientes MCP, usá **Nuevo acceso con token**:

1. Poné un **Nombre** para reconocerlo en el listado y en la auditoría.
2. Elegí los **alcances**:
   - **Módulos:** todos o algunos.
   - **Permisos:** sin tildar es solo lectura; con **Lectura y escritura** puede cambiar cosas.
   - **Organizaciones:** todas o algunas.
   - **Vencimiento:** 30 días, 90 días, 1 año o sin vencimiento.
3. Tocá **Crear acceso y ver el token**. **Copialo ahora: no se vuelve a mostrar.** Faro te muestra el comando y la configuración listos para pegar.

## Reglas de seguridad

- Cada acceso usa **los permisos de tu rol**, nunca más.
- Aunque tenga escritura, **las acciones sensibles no se ejecutan**: quedan en [Aprobaciones](/ayuda/ia/ia-y-aprobaciones).
- En Inicial y en los planes gratis, el acceso es de consultas.
- Toda llamada queda registrada: en **Accesos MCP** ves la herramienta, el resultado y la duración.

## Revocar un acceso

En **Accesos del estudio**, buscá el acceso y revocalo. **Sus tokens dejan de funcionar al instante.** Podés revocar los tuyos; el dueño de la cuenta puede revocar cualquiera.
