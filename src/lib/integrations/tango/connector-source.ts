import { z } from "zod";
import { MAX_RECORDS_PER_BATCH } from "./constants";
import type { TangoBatch, TangoSource } from "./source";

// Mensajes que manda el conector local al endpoint de ingest.

const company = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().max(200).nullish(),
  ok: z.boolean().optional(),
  error: z.string().max(500).nullish(),
});

export const connectorMessage = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ping"),
    connectorVersion: z.string().max(40).optional(),
    companies: z.array(company).max(500).default([]),
  }),
  z.object({
    kind: z.literal("sync_start"),
    syncId: z.string().min(8).max(80),
    companies: z.array(company).max(500).default([]),
  }),
  z.object({
    kind: z.literal("records"),
    syncId: z.string().min(8).max(80),
    company,
    process: z.number().int().positive(),
    page: z.number().int().nonnegative().optional(),
    records: z.array(z.record(z.unknown())).max(MAX_RECORDS_PER_BATCH),
  }),
  z.object({
    kind: z.literal("sync_end"),
    syncId: z.string().min(8).max(80),
    ok: z.boolean(),
    message: z.string().max(2000).nullish(),
  }),
]);

export type ConnectorMessage = z.infer<typeof connectorMessage>;

/** Implementación "connector" de TangoSource: un mensaje "records" es un lote */
export const connectorSource: TangoSource<ConnectorMessage> = {
  kind: "connector",
  toBatches(message) {
    if (message.kind !== "records") return [];
    const batch: TangoBatch = {
      companyId: message.company.id,
      companyName: message.company.name ?? null,
      process: message.process,
      records: message.records as Record<string, unknown>[],
    };
    return [batch];
  },
};
