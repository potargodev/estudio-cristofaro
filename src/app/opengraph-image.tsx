import { ImageResponse } from "next/og";

export const alt = "Estudio Cristofaro & Asociados · Tu contador, siempre al día";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#1f5c4a",
          color: "#f2f4f1",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 8,
              background: "#f2f4f1",
              color: "#1f5c4a",
              fontSize: 40,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            C
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 32, fontWeight: 600 }}>Cristofaro</span>
            <span style={{ fontSize: 22, opacity: 0.75 }}>Estudio contable & asociados</span>
          </div>
        </div>
        <div style={{ fontSize: 68, fontWeight: 600, lineHeight: 1.08, maxWidth: 950 }}>
          Tu contador, siempre al día. Sin papeles, sin sorpresas.
        </div>
        <div style={{ display: "flex", fontSize: 26, opacity: 0.8 }}>Monotributo · PyMEs · Sociedades · Sueldos — CABA y GBA</div>
      </div>
    ),
    size,
  );
}
