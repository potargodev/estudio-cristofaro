/** Datos estructurados (schema.org). Escapa "<" para que un texto con "</script>" no cierre la etiqueta */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
