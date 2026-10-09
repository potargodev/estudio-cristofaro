import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { calendar_connections } from "@/db/schema";
import { decrypt, encrypt, encryptionEnabled } from "../crypto";
import { getSiteUrl } from "../runtime-config";

// Google Calendar (separado del login de clientes): leer ocupación (freebusy) y
// crear eventos con Google Meet invitando al cliente. Usa las mismas
// credenciales OAuth del proyecto de Google Cloud (GOOGLE_CLIENT_ID/SECRET),
// con la Calendar API habilitada y su propia URI de redirección.
// GOOGLE_API_MOCK_URL (solo pruebas) apunta todo a un simulador local.

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "openid",
  "email",
];

const mock = () => process.env.GOOGLE_API_MOCK_URL?.trim() || null;
const urls = () => {
  const m = mock();
  return {
    auth: m ? `${m}/o/oauth2/v2/auth` : "https://accounts.google.com/o/oauth2/v2/auth",
    token: m ? `${m}/token` : "https://oauth2.googleapis.com/token",
    userinfo: m ? `${m}/oauth2/v3/userinfo` : "https://openidconnect.googleapis.com/v1/userinfo",
    api: m ? `${m}/calendar/v3` : "https://www.googleapis.com/calendar/v3",
    revoke: m ? `${m}/revoke` : "https://oauth2.googleapis.com/revoke",
  };
};

const creds = () => ({ id: process.env.GOOGLE_CLIENT_ID?.trim(), secret: process.env.GOOGLE_CLIENT_SECRET?.trim() });

/** ¿Se puede conectar Google Calendar? (credenciales + ENCRYPTION_KEY) */
export function calendarAvailable() {
  const c = creds();
  return Boolean(((c.id && c.secret) || mock()) && encryptionEnabled());
}

export const calendarRedirectUri = () => `${getSiteUrl()}/api/agenda/google/callback`;

export function calendarAuthUrl(state: string) {
  const u = new URL(urls().auth);
  u.searchParams.set("client_id", creds().id ?? "mock-client");
  u.searchParams.set("redirect_uri", calendarRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", CALENDAR_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(urls().token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds().id ?? "mock-client", client_secret: creds().secret ?? "mock-secret", ...params }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Callback del OAuth: guarda los tokens cifrados de la persona del estudio */
export async function connectCalendar(userId: string, studioId: string, code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: calendarRedirectUri() });
  const info = await fetch(urls().userinfo, { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => (r.ok ? r.json() : {}));
  const values = {
    studio_id: studioId,
    google_email: (info as { email?: string }).email ?? null,
    access_token_enc: encrypt(t.access_token),
    refresh_token_enc: t.refresh_token ? encrypt(t.refresh_token) : null,
    expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
    scope: t.scope ?? CALENDAR_SCOPES.join(" "),
    connected_at: new Date(),
  };
  await getDb()
    .insert(calendar_connections)
    .values({ user_id: userId, ...values })
    .onConflictDoUpdate({
      target: calendar_connections.user_id,
      // Si Google no devuelve refresh_token (ya había consentimiento) se conserva el anterior
      set: values.refresh_token_enc ? values : { ...values, refresh_token_enc: undefined },
    });
  return values.google_email;
}

export async function disconnectCalendar(userId: string) {
  const [row] = await getDb().delete(calendar_connections).where(eq(calendar_connections.user_id, userId)).returning();
  if (row?.refresh_token_enc) {
    await fetch(`${urls().revoke}?token=${encodeURIComponent(decrypt(row.refresh_token_enc))}`, { method: "POST" }).catch(() => {});
  }
}

export async function getConnection(userId: string) {
  const [row] = await getDb().select().from(calendar_connections).where(eq(calendar_connections.user_id, userId));
  return row ?? null;
}

/** Access token vigente (lo renueva con el refresh token si venció) */
async function accessToken(userId: string): Promise<string | null> {
  if (!encryptionEnabled()) return null;
  const row = await getConnection(userId);
  if (!row) return null;
  if (row.expires_at && row.expires_at.getTime() > Date.now() + 60_000) return decrypt(row.access_token_enc);
  if (!row.refresh_token_enc) return null;
  const t = await tokenRequest({ refresh_token: decrypt(row.refresh_token_enc), grant_type: "refresh_token" });
  await getDb()
    .update(calendar_connections)
    .set({ access_token_enc: encrypt(t.access_token), expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000) })
    .where(eq(calendar_connections.user_id, userId));
  return t.access_token;
}

async function api(userId: string, path: string, init: RequestInit = {}) {
  const token = await accessToken(userId);
  if (!token) return null;
  const res = await fetch(`${urls().api}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok && res.status !== 410 && res.status !== 404) throw new Error(`Google Calendar ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 || res.status === 410 || res.status === 404 ? {} : res.json();
}

/** Intervalos ocupados del calendario principal entre `from` y `to` (null si no está conectado) */
export async function busyIntervals(userId: string, from: Date, to: Date): Promise<{ start: Date; end: Date }[] | null> {
  try {
    const res = (await api(userId, "/freeBusy", {
      method: "POST",
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] }),
    })) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } } | null;
    if (!res) return null;
    return (res.calendars?.primary?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  } catch (error) {
    console.error("[agenda] freebusy", error);
    return null; // sin Google se sigue con las reservas propias
  }
}

export interface EventInput {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  attendee: { email: string; name: string };
}

/** Crea el evento con Google Meet e invita al cliente. Devuelve id y link de Meet. */
export async function createMeetEvent(userId: string, e: EventInput): Promise<{ id: string; meetUrl: string | null } | null> {
  const res = (await api(userId, "/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
    method: "POST",
    body: JSON.stringify({
      summary: e.summary,
      description: e.description,
      start: { dateTime: e.start.toISOString() },
      end: { dateTime: e.end.toISOString() },
      attendees: [{ email: e.attendee.email, displayName: e.attendee.name }],
      conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      reminders: { useDefault: true },
    }),
  })) as { id?: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } } | null;
  if (!res?.id) return null;
  const meet = res.hangoutLink ?? res.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
  return { id: res.id, meetUrl: meet };
}

export async function moveEvent(userId: string, eventId: string, start: Date, end: Date) {
  await api(userId, `/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "PATCH",
    body: JSON.stringify({ start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } }),
  });
}

export async function cancelEvent(userId: string, eventId: string) {
  await api(userId, `/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE" });
}
