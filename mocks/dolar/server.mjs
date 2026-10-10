// Cotizaciones de prueba con el formato de DolarApi (dolarapi.com), para
// probar gastos en otra moneda sin salir a internet:
//   node mocks/dolar/server.mjs   → http://localhost:4040  (FX_API_URL)

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4040);
const RATES = {
  "/v1/dolares/oficial": { compra: 1320, venta: 1370, casa: "oficial" },
  "/v1/dolares/bolsa": { compra: 1400, venta: 1415.5, casa: "bolsa" },
  "/v1/cotizaciones/eur": { compra: 1480, venta: 1530, moneda: "EUR" },
  "/v1/cotizaciones/brl": { compra: 240, venta: 252, moneda: "BRL" },
};

createServer((req, res) => {
  const r = RATES[req.url ?? ""];
  res.setHeader("Content-Type", "application/json");
  if (!r) {
    res.statusCode = 404;
    return res.end("{}");
  }
  res.end(JSON.stringify({ ...r, fechaActualizacion: new Date().toISOString() }));
}).listen(PORT, () => console.log(`Cotizaciones de prueba en http://localhost:${PORT}`));
