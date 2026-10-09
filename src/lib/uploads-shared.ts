// Constantes de subida que también usan componentes del navegador
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.xlsx";
export const ALLOWED_LABEL = "PDF, JPG, PNG o XLSX de hasta 10 MB";

export function formatBytes(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
