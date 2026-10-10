import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";
import { getDb } from "@/db";
import { bookings, organizations, users } from "@/db/schema";
import { orgHosts } from "@/lib/agenda/org-hosts";
import { availableSlots, getHosts } from "@/lib/agenda/slots";
import { defineTool } from "../types";
import { uuid } from "./helpers";

const fmt = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export const agendaTools = [
  defineTool({
    name: "ver_agenda",
    title: "Ver agenda",
    description: "Llamadas agendadas del estudio (confirmadas) en los próximos días, con quién, cuándo y el link de Meet.",
    module: "agenda",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({
      dias: z.number().int().min(1).max(60).default(7).describe("Cuántos días hacia adelante"),
      solo_mias: z.boolean().default(false).describe("Solo las llamadas de quien pregunta"),
    }),
    async handler(input, ctx) {
      const now = new Date();
      const rows = await getDb()
        .select({
          id: bookings.id,
          inicio: bookings.starts_at,
          fin: bookings.ends_at,
          nombre: bookings.name,
          email: bookings.email,
          motivo: bookings.reason,
          meet: bookings.meet_url,
          con: users.name,
          organizacion_id: bookings.organization_id,
          organizacion: organizations.name,
        })
        .from(bookings)
        .innerJoin(users, eq(users.id, bookings.host_user_id))
        .leftJoin(organizations, eq(organizations.id, bookings.organization_id))
        .where(
          and(
            eq(bookings.studio_id, ctx.studioId),
            eq(bookings.status, "confirmada"),
            gte(bookings.starts_at, now),
            lte(bookings.starts_at, new Date(now.getTime() + input.dias * 86400000)),
            input.solo_mias ? eq(bookings.host_user_id, ctx.actor.id) : undefined,
          ),
        )
        .orderBy(asc(bookings.starts_at));
      // Con un acceso limitado a algunas organizaciones, no se ven llamadas de otras (ni de consultas sin organización)
      const visible = ctx.allowedOrganizations ? rows.filter((r) => r.organizacion_id && ctx.allowedOrganizations!.includes(r.organizacion_id)) : rows;
      return { total: visible.length, llamadas: visible.map((r) => ({ ...r, cuando: fmt.format(r.inicio) })) };
    },
  }),
  defineTool({
    name: "proponer_horarios",
    title: "Proponer horarios",
    description:
      "Horarios libres para una llamada, según la disponibilidad y el Google Calendar del equipo. Con organizacion_id usa a su responsable y colaboradores. Devuelve opciones para proponerle al cliente (no reserva nada).",
    module: "agenda",
    level: "lectura",
    roles: ["dueno", "contador", "colaborador"],
    input: z.object({
      organizacion_id: uuid("ID de la organización").optional(),
      dias: z.number().int().min(1).max(21).default(7),
      cantidad: z.number().int().min(1).max(20).default(6),
    }),
    organizationOf: async (input) => input.organizacion_id ?? null,
    async handler(input, ctx) {
      let hosts;
      if (input.organizacion_id) {
        const org = await ctx.organization(input.organizacion_id);
        hosts = await orgHosts(ctx.studioId, org.id);
      } else {
        hosts = await getHosts(ctx.studioId);
      }
      if (!hosts.length) return { horarios: [], aviso: "Nadie del equipo tiene la disponibilidad activada en Agenda." };
      const byDay = await availableSlots(hosts, { days: input.dias });
      const names = new Map(hosts.map((h) => [h.av.user_id, h.name]));
      const out: { inicio: string; cuando: string; con: string | undefined }[] = [];
      // Repartidos: hasta 2 por día para que haya variedad
      for (const list of byDay.values()) {
        for (const s of list.filter((_, i) => i % Math.max(1, Math.floor(list.length / 2)) === 0).slice(0, 2)) {
          out.push({ inicio: s.start.toISOString(), cuando: fmt.format(s.start), con: names.get(s.hostId) });
        }
        if (out.length >= input.cantidad) break;
      }
      return { horarios: out.slice(0, input.cantidad) };
    },
  }),
];
