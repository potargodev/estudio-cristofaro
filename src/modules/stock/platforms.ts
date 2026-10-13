// Plataformas de venta de Stock (§2.q etapa 7). Sin "server-only": lo usan
// también el catálogo de adaptadores y las pantallas.

export type Platform = "mercadolibre" | "tiendanube" | "empretienda" | "shopify" | "woocommerce" | "vtex" | "mercadopago" | "fisica";

interface PlatformInfo {
  label: string;
  /** Cómo llegan las ventas: aviso (webhook), consulta periódica o importación de archivo */
  orders: "webhook" | "consulta" | "importacion";
  /** Se puede publicar la existencia */
  publish: boolean;
  /** Lo que falta para la API real */
  missing: string;
}

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  mercadolibre: { label: "Mercado Libre", orders: "webhook", publish: true, missing: "App en developers.mercadolibre.com.ar (client id y secret), OAuth del vendedor, notificaciones del tópico orders_v2 y PUT /items/{id} con available_quantity (o user_products para variantes)." },
  tiendanube: { label: "Tiendanube", orders: "webhook", publish: true, missing: "App en el Partners de Tiendanube, OAuth de la tienda, webhooks order/paid, order/cancelled y PUT /products/{id}/variants/{id} con stock." },
  empretienda: { label: "Empretienda", orders: "consulta", publish: true, missing: "API key de la tienda y confirmar con Empretienda los endpoints de pedidos y de stock (la API pública es acotada)." },
  shopify: { label: "Shopify", orders: "webhook", publish: true, missing: "App personalizada con los permisos read_orders y write_inventory, webhooks orders/paid y orders/cancelled e inventory_levels/set con la ubicación." },
  woocommerce: { label: "WooCommerce", orders: "webhook", publish: true, missing: "Claves de la REST API de WooCommerce (consumer key y secret) de cada sitio, webhooks order.updated y PUT /products/{id} con stock_quantity." },
  vtex: { label: "VTEX", orders: "consulta", publish: true, missing: "App key y token de la cuenta VTEX, feed de pedidos (OMS) y la API de Logistics para el inventario por depósito." },
  mercadopago: { label: "Mercado Pago (QR y Point)", orders: "webhook", publish: false, missing: "Webhook de pagos de la cuenta (ya conectada en Cobros) y la referencia del producto en el pago (external_reference) para saber qué se vendió." },
  fisica: { label: "Tienda física (importación)", orders: "importacion", publish: false, missing: "Nada: las ventas del local se importan por archivo (CSV o Excel del sistema de caja)." },
};

export const isPlatform = (p: string): p is Platform => p in PLATFORMS;
