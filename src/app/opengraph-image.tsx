import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Ordilo – Dokumente für die Familie";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return renderOgImage({
    title: "Papierkram rein. Kopf frei.",
    subtitle: "Briefe scannen. Antworten finden. Gemeinsam dran denken.",
  });
}
