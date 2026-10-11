// Prueba del cliente de ARCA contra el simulador (mocks/arca): certificado
// autofirmado, WSAA con CMS firmado, WSFE (último número, CAE, rechazo,
// recuperación tras un corte) y constancia de inscripción.
//
//   node mocks/arca/server.mjs &
//   ARCA_WSAA_URL=http://localhost:4060/ws/services/LoginCms ARCA_WSFE_URL=http://localhost:4060/wsfev1/service.asmx ARCA_PADRON_URL=http://localhost:4060/sr-padron/webservices/personaServiceA5 \
//   node --conditions=react-server --env-file=.env.local --import tsx scripts/pruebas/arca-cliente.mts

import forge from "node-forge";
import { getTicket, certInfo, keyMatchesCert } from "../../src/modules/arca/wsaa.ts";
import { feDummy, lastAuthorized, salesPoints, solicitarCae, consultarComprobante } from "../../src/modules/arca/wsfe.ts";
import { getPersona } from "../../src/modules/arca/padron.ts";

let fails = 0;
const check = (label: string, ok: boolean, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✔" : "✘"} ${label}${extra ? ` · ${extra}` : ""}`);
};

export function selfSigned(cuit = "20111111112") {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const attrs = [{ name: "commonName", value: "faro-pruebas" }, { type: "2.5.4.5", value: `CUIT ${cuit}` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
const { certPem, keyPem } = selfSigned();
const cred = { env: "homologacion" as const, cuit: "20111111112", certPem, keyPem };
check("certificado y clave coinciden", keyMatchesCert(certPem, keyPem));
check("datos del certificado", certInfo(certPem).subject === "faro-pruebas");
await fetch("http://localhost:4060/__reset", { method: "POST" });

const t1 = await getTicket(cred, "wsfe");
const t2 = await getTicket(cred, "wsfe");
check("WSAA devuelve ticket y se reusa del caché", !!t1.token && t1.token === t2.token);
check("FEDummy", (await feDummy(cred)).app === "OK");
const emisor = "20304050607";
check("puntos de venta", (await salesPoints(cred, emisor)).length === 2);
const last = await lastAuthorized(cred, emisor, 1, 11);
const base = { ptoVta: 1, cbteTipo: 11, concepto: 2, docTipo: 80, docNro: "30711111119", cbteFch: "20261011", impTotal: 150000, impTotConc: 0, impNeto: 150000, impOpEx: 0, impIva: 0, impTrib: 0, fchServDesde: "20261001", fchServHasta: "20261011", fchVtoPago: "20261011", monId: "PES", monCotiz: 1, condicionIvaReceptorId: 1, iva: [] };
const ok = await solicitarCae(cred, emisor, { ...base, cbteNro: last + 1 });
check("factura C autorizada con CAE", ok.approved && /^\d{14}$/.test(ok.cae ?? ""), ok.cae ?? JSON.stringify(ok.observations));
const bad = await solicitarCae(cred, emisor, { ...base, cbteNro: last + 5 });
check("número salteado: rechazo con observación", !bad.approved && bad.observations.some((o) => o.code === 10016));
const badIva = await solicitarCae(cred, emisor, { ...base, cbteNro: last + 2, impIva: 100, impTotal: 150100, iva: [{ id: 5, baseImp: 476, importe: 100 }] });
check("factura C con IVA: rechazo", !badIva.approved && badIva.observations.some((o) => o.code === 10071));
const a = await solicitarCae(cred, emisor, { ...base, cbteTipo: 1, cbteNro: (await lastAuthorized(cred, emisor, 1, 1)) + 1, impNeto: 1000, impIva: 210, impTotal: 1210, iva: [{ id: 5, baseImp: 1000, importe: 210 }] });
check("factura A con IVA 21%", a.approved, JSON.stringify(a.observations));
// Corte después de autorizar: se recupera con FECompConsultar
await fetch("http://localhost:4060/__caida", { method: "POST" });
const n = (await lastAuthorized(cred, emisor, 1, 11)) + 1;
let cut = false;
try {
  await solicitarCae(cred, emisor, { ...base, cbteNro: n });
} catch {
  cut = true;
}
const rec = await consultarComprobante(cred, emisor, 1, 11, n);
check("corte de red y recuperación del CAE", cut && /^\d{14}$/.test(rec?.cae ?? ""));
const p = await getPersona(cred, "20304050607");
check("constancia: monotributista categoría D", p.data.regime === "monotributo" && p.data.category === "D", p.data.categoryDetail ?? "");
const ri = await getPersona(cred, "30711111119");
check("constancia: responsable inscripto", ri.data.regime === "responsable_inscripto");
let unknown = "";
try {
  await getPersona(cred, "20999999990");
} catch (e) {
  unknown = (e as Error).message;
}
check("CUIT inexistente: error legible", /No existe/.test(unknown), unknown);
console.log(fails ? `\n${fails} fallaron` : "\nTodo bien");
process.exit(fails ? 1 : 0);
}
