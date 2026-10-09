// Datos de ejemplo del simulador: 2 empresas y 30 clientes con CUIT.
// Los nombres de campo imitan los de la tabla GVA14 de Tango (Clientes).

export const COMPANIES = {
  1: "Estudio Cristofaro - Clientes generales",
  2: "Estudio Cristofaro - Sociedades",
};

const NAMES = [
  "Panadería La Espiga", "Ferretería San Martín", "Kiosco El Sol", "Dra. Laura Gómez", "Estudio Pereyra Arquitectos",
  "Café Martínez Palermo", "Distribuidora Río SA", "Construcciones del Plata SRL", "Óptica Visión", "Lavadero Burbujas",
  "Gimnasio Fuerza", "Farmacia Central", "Librería Atenea", "Verdulería Doña Rosa", "Taller Mecánico Norte",
  "Pinturería Arcoíris", "Peluquería Estilo", "Veterinaria Patitas", "Agencia Digital Nube SAS", "Consultora Andes SRL",
  "Transporte Rápido SA", "Imprenta Gráfica Sur", "Clínica Odontológica Sonrisa", "Restaurante La Esquina", "Inmobiliaria Horizonte",
  "Software Delta SAS", "Bodega Los Álamos SA", "Electricidad Volta", "Escuela de Idiomas Babel", "Carpintería El Roble",
];

/** CUIT con dígito verificador válido */
function cuit(prefix, n) {
  const base = `${prefix}${String(n).padStart(8, "0")}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(base[i]) * weights[i];
  let dv = 11 - (sum % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return `${base}${dv}`;
}

export function buildClients() {
  const byCompany = { 1: [], 2: [] };
  NAMES.forEach((name, i) => {
    const company = i < 18 ? 1 : 2;
    const isCompany = /SA|SRL|SAS/.test(name);
    const c = cuit(isCompany ? "30" : "20", 71000000 + i * 137);
    byCompany[company].push({
      ID_GVA14: 1000 + i,
      COD_GVA14: `C${String(i + 1).padStart(5, "0")}`,
      RAZON_SOCI: name.toUpperCase(),
      // Algunos con guiones, como suele venir de Tango
      CUIT: i % 3 === 0 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c,
      DOMICILIO: `Av. Corrientes ${1200 + i * 10}`,
      LOCALIDAD: "CABA",
      E_MAIL: `contacto${i + 1}@ejemplo.com.ar`,
      TELEFONO_1: `11 4${String(500 + i).padStart(3, "0")}-${String(1000 + i * 7).slice(-4)}`,
      COND_IVA: isCompany ? "RI" : i % 2 ? "MT" : "RI",
      HABILITADO: true,
    });
  });
  return byCompany;
}
