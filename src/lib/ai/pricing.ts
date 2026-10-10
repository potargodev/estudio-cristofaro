// Precios de referencia en USD por millón de tokens (entrada / salida) para el
// costo estimado. Es una estimación: el costo real lo informa cada proveedor.
// Modelos sin precio conocido (locales, deployments de Azure con otro nombre)
// cuentan como $0 y se marcan como "sin precio".

const PRICES: [RegExp, number, number][] = [
  [/opus/i, 15, 75],
  [/sonnet/i, 3, 15],
  [/haiku/i, 1, 5],
  [/gpt-5(\.\d)?-nano/i, 0.05, 0.4],
  [/gpt-5(\.\d)?-mini/i, 0.25, 2],
  [/gpt-5/i, 1.25, 10],
  [/gpt-4\.1-nano/i, 0.1, 0.4],
  [/gpt-4\.1-mini/i, 0.4, 1.6],
  [/gpt-4\.1/i, 2, 8],
  [/gpt-4o-mini/i, 0.15, 0.6],
  [/gpt-4o/i, 2.5, 10],
  [/gemini-.*flash-lite/i, 0.1, 0.4],
  [/gemini-.*flash/i, 0.3, 2.5],
  [/gemini-.*pro/i, 1.25, 10],
];

export function priceFor(model: string): { input: number; output: number } | null {
  const hit = PRICES.find(([re]) => re.test(model));
  return hit ? { input: hit[1], output: hit[2] } : null;
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const p = priceFor(model);
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
