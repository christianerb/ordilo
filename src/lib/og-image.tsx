import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

/** Shared brand card for social previews and AI answer thumbnails. */
export async function renderOgImage({
  title,
  subtitle,
  eyebrow = "Ordilo",
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
}) {
  const font = await readFile(join(process.cwd(), "src/assets/fonts/Figtree.ttf"));
  // Long guide titles get a smaller size so they never overflow the card.
  const titleSize = title.length > 48 ? 56 : 72;
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
        fontFamily: "Figtree",
        fontWeight: 600,
      }}
    >
      <div style={{ display: "flex", fontSize: 36 }}>{eyebrow}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 600,
            letterSpacing: -3,
            lineHeight: 1.08,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 32, color: "#D3CEC5" }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", fontSize: 26, color: "#F0B4A0" }}>
        Die Dokumenten-App für Familien · ordilo.de
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [{ name: "Figtree", data: font, weight: 600, style: "normal" }],
    },
  );
}
