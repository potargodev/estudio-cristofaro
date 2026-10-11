import "server-only";
import { z } from "zod/v4";
import { defineTool } from "../types";

// Cuentas conectadas (principios §4 a §8): el Vigía del estudio las lista con
// su estado y lo que autorizaron. Solo lectura: operar sobre una cuenta se hace
// desde su ficha, con la perilla de autonomía que eligió la persona.

export const cuentasTools = [
  defineTool({
    name: "listar_cuentas_conectadas",
    title: "Cuentas conectadas",
    description: "Personas y autónomos conectados con el estudio (conexión por permiso, no copia): estado (admisión, acuerdo, conectada, en cierre), qué autorizaron (caja de negocio y lo fiscal; cajas personales solo si las activaron) y cómo trabajan (delegar y mirar o proponer y aprobar).",
    module: "cuentas",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({ estado: z.enum(["admision", "acuerdo", "activa", "en_cierre", "en_disputa", "cerrada"]).optional() }),
    async handler(input, ctx) {
      const { studioConnections, STATUS_LABEL, AUTONOMY_LABEL } = await import("@/modules/conexiones/server");
      const rows = await studioConnections({ id: ctx.actor.id, name: ctx.actor.name, email: ctx.actor.email, studioId: ctx.studioId, role: ctx.actor.role, tenantKind: "studio" });
      return rows
        .filter((r) => !input.estado || r.c.status === input.estado)
        .slice(0, 50)
        .map((r) => ({ id: r.c.id, nombre: r.name, estado: STATUS_LABEL[r.c.status], comparte: r.c.scope_personal ? "caja de negocio, lo fiscal y cajas personales" : "caja de negocio y lo fiscal", autonomia: AUTONOMY_LABEL[r.c.autonomy as "delegar" | "proponer"], enlace: ["activa", "en_cierre", "en_disputa"].includes(r.c.status) ? `/admin/organizaciones/cuenta/${r.c.id}` : `/admin/comercial/conexiones/${r.c.id}` }));
    },
  }),
];
