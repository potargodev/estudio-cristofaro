import "server-only";
import { randomBytes } from "node:crypto";

// Links de pago de Mercado Pago para saldar deudas. Por ahora es una interfaz
// con un proveedor de prueba: la integración real (OAuth de la cuenta del
// acreedor y la API de preferencias) llega en la F7. Con MERCADOPAGO_MOCK_URL
// se puede apuntar a un mock local.

export interface PaymentLinkRequest {
  amount: number; // centavos
  currency: string;
  description: string;
  payee: { name: string; alias: string | null };
}

export interface PaymentLinkProvider {
  readonly name: string;
  readonly real: boolean;
  createLink(req: PaymentLinkRequest): Promise<{ url: string; externalId: string }>;
}

const mockProvider: PaymentLinkProvider = {
  name: "Mercado Pago (prueba)",
  real: false,
  async createLink(req) {
    const id = `mock-${randomBytes(6).toString("hex")}`;
    const base = process.env.MERCADOPAGO_MOCK_URL?.trim() || "https://www.mercadopago.com.ar/checkout/v1/redirect";
    const params = new URLSearchParams({ pref_id: id, amount: (req.amount / 100).toFixed(2), currency: req.currency, title: req.description.slice(0, 80) });
    return { url: `${base}?${params}`, externalId: id };
  },
};

export function paymentLinks(): PaymentLinkProvider {
  return mockProvider;
}
