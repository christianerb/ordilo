import { ImageResponse } from "next/og";

export const alt = "Ordilo – Dokumente für die Familie";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 72,
        background: "#193232",
        color: "#FDFCFA",
      }}
    >
      <div style={{ display: "flex", fontSize: 36 }}>Ordilo</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -3 }}>
          Papierkram rein. Kopf frei.
        </div>
        <div style={{ fontSize: 32, color: "#D3CEC5" }}>
          Briefe scannen. Antworten finden. Gemeinsam dran denken.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 26, color: "#F0B4A0" }}>
        Die Dokumenten-App für Familien · ordilo.de
      </div>
    </div>,
    size,
  );
}
