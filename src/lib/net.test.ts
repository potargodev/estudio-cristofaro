import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicUrl, isPrivateAddress } from "./net";

test("direcciones privadas, loopback, link-local y mapeadas", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"])
    assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "200.45.1.1", "2800:3f0:4002::200e"]) assert.equal(isPrivateAddress(ip), false, ip);
});

test("solo URLs https públicas", () => {
  delete process.env.ALLOW_PRIVATE_URLS;
  assert.equal(assertPublicUrl("https://api.openai.com/v1").hostname, "api.openai.com");
  for (const u of ["http://api.example.com", "https://localhost:3000", "https://127.0.0.1", "https://[::1]/", "https://169.254.169.254/latest", "https://db.internal", "https://u:p@example.com", "file:///etc/passwd", "no es url"])
    assert.throws(() => assertPublicUrl(u), u);
});

test("rutas internas para volver", async () => {
  const { internalPath } = await import("./paths");
  assert.equal(internalPath("/bitacora?mes=2026-10", "/x"), "/bitacora?mes=2026-10");
  for (const v of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/a b", null, 3]) assert.equal(internalPath(v, "/x"), "/x", String(v));
});
