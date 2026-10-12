import "server-only";
import { lookup, type LookupAddress } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { allowPrivate, assertPublicUrl, isPrivateAddress } from "./net";

export { assertPublicUrl, UnsafeUrlError } from "./net";

// fetch para URLs que elige un tenant (proveedores de IA, servidores MCP
// externos, la API de Tango): nunca llega a la red interna del servidor
// (loopback, redes privadas, link-local como 169.254.169.254, CGNAT). El
// control va en la resolución de cada conexión, así un DNS que cambia entre
// la validación y el pedido (rebinding) tampoco pasa. Sin redirecciones.
//
// ALLOW_PRIVATE_URLS=true lo apaga: SOLO pruebas locales con los simuladores.

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function publicLookup(hostname: string, options: object, cb: LookupCb) {
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) return cb(Object.assign(new Error(`${hostname} no es una dirección pública`), { code: "EPRIVATE" }), []);
    const wantsAll = (options as { all?: boolean }).all;
    return wantsAll ? cb(null, list) : cb(null, list[0].address, list[0].family);
  });
}

let agent: Agent | null = null;
const publicAgent = () => (agent ??= new Agent({ connect: { lookup: publicLookup as never } }));

/** Mismo contrato que fetch, solo hacia internet pública */
export const safeFetch: typeof fetch = async (input, init) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  assertPublicUrl(href);
  if (allowPrivate()) return fetch(input, init);
  return (await undiciFetch(typeof input === "string" || input instanceof URL ? href : (input as never), { ...(init as object), redirect: "error", dispatcher: publicAgent() } as never)) as unknown as Response;
};
