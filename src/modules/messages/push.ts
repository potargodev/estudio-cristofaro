import "server-only";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "@/db";
import { faro_settings, push_subscriptions } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { getSiteUrl } from "@/lib/runtime-config";

// Notificaciones push (PWA). Las claves VAPID salen de VAPID_PUBLIC_KEY y
// VAPID_PRIVATE_KEY; si no están, se generan una vez y se guardan en la base
// (la privada cifrada con ENCRYPTION_KEY), así funciona sin configurar nada.

const KEY = "vapid";
let cached: { publicKey: string; privateKey: string } | null = null;

export async function vapidKeys() {
  if (cached) return cached;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (pub && priv) return (cached = { publicKey: pub, privateKey: priv });
  const db = getDb();
  const [row] = await db.select().from(faro_settings).where(eq(faro_settings.key, KEY));
  const v = row?.value as { publicKey?: string; privateKeyEnc?: string } | undefined;
  if (v?.publicKey && v.privateKeyEnc) return (cached = { publicKey: v.publicKey, privateKey: decrypt(v.privateKeyEnc) });
  const k = webpush.generateVAPIDKeys();
  await db.insert(faro_settings).values({ key: KEY, value: { publicKey: k.publicKey, privateKeyEnc: encrypt(k.privateKey) } }).onConflictDoNothing();
  const [again] = await db.select().from(faro_settings).where(eq(faro_settings.key, KEY));
  const a = again.value as { publicKey: string; privateKeyEnc: string };
  return (cached = { publicKey: a.publicKey, privateKey: decrypt(a.privateKeyEnc) });
}

// Servicios de push de los navegadores: el servidor solo les manda a ellos (nunca a una URL cualquiera)
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

function pushEndpointOk(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  if (typeof sub?.endpoint !== "string" || sub.endpoint.length > 1000 || !pushEndpointOk(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Suscripción inválida");
  await getDb()
    .insert(push_subscriptions)
    .values({ user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh.slice(0, 200), auth: sub.keys.auth.slice(0, 100) })
    .onConflictDoUpdate({ target: push_subscriptions.endpoint, set: { user_id: userId, p256dh: sub.keys.p256dh.slice(0, 200), auth: sub.keys.auth.slice(0, 100) } });
}

export async function deleteSubscription(userId: string, endpoint: string) {
  const db = getDb();
  const [s] = await db.select().from(push_subscriptions).where(eq(push_subscriptions.endpoint, endpoint));
  if (s?.user_id === userId) await db.delete(push_subscriptions).where(eq(push_subscriptions.id, s.id));
}

/** Manda el aviso a todos los dispositivos de esas personas. Nunca rompe el envío del mensaje */
export async function pushTo(userIds: string[], n: { title: string; body: string; url: string }) {
  if (!userIds.length) return;
  const subs = await getDb().select().from(push_subscriptions).where(inArray(push_subscriptions.user_id, userIds));
  if (!subs.length) return;
  const k = await vapidKeys();
  webpush.setVapidDetails(`mailto:${process.env.PUSH_CONTACT_EMAIL?.trim() || "faro@estudiocristofaro.com"}`, k.publicKey, k.privateKey);
  const payload = JSON.stringify({ ...n, url: new URL(n.url, getSiteUrl()).pathname });
  await Promise.all(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 }).catch(async (e: { statusCode?: number }) => {
        // Suscripción vencida o dada de baja en el navegador
        if (e.statusCode === 404 || e.statusCode === 410) await getDb().delete(push_subscriptions).where(eq(push_subscriptions.id, s.id));
      }),
    ),
  );
}
