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

// Índice FACPCE de prueba (A2): de dic-2023 a dic-2026, 2 % por mes desde 8.000
function facpce() {
  const rows = ["mes;indice"];
  let v = 8000;
  for (let y = 2023; y <= 2026; y++)
    for (let m = y === 2023 ? 12 : 1; m <= 12; m++) {
      rows.push(`${y}-${String(m).padStart(2, "0")};${v.toFixed(4).replace(".", ",")}`);
      v *= 1.02;
    }
  return rows.join("\n");
}

createServer((req, res) => {
  if (req.url === "/indices/facpce.csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.end(facpce());
  }
  const r = RATES[req.url ?? ""];
  res.setHeader("Content-Type", "application/json");
  if (!r) {
    res.statusCode = 404;
    return res.end("{}");
  }
  res.end(JSON.stringify({ ...r, fechaActualizacion: new Date().toISOString() }));
}).listen(PORT, () => console.log(`Cotizaciones de prueba en http://localhost:${PORT}`));
