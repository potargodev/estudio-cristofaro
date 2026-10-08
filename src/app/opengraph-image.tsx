import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Estudio Cristofaro & Asociados · Tu contador, siempre al día";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Colores del manual de marca: azul noche de fondo y rosé para el logo.
const navy = "#1c2235";
const rose = "#c9a596";
const paper = "#f7f5f3";

export default async function OgImage() {
  const svg = await readFile(join(process.cwd(), "public/marca/logo-horizontal.svg"), "utf8");
  const logo = `data:image/svg+xml;base64,${Buffer.from(svg.replaceAll("#1c2235", rose)).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: navy,
          color: paper,
          padding: 72,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={452} height={100} />
        <div style={{ fontSize: 64, fontWeight: 400, lineHeight: 1.1, maxWidth: 950 }}>
          Tu contador, siempre al día. Sin papeles, sin sorpresas.
        </div>
        <div style={{ display: "flex", fontSize: 26, color: rose }}>
          Monotributo · PyMEs · Sociedades · Sueldos — CABA y GBA
        </div>
      </div>
    ),
    size,
  );
}
