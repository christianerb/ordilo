import { notFound } from "next/navigation";
import { guides, getGuide } from "@/content/guides";
import { renderOgImage } from "@/lib/og-image";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map(({ slug }) => ({ slug }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  return renderOgImage({
    eyebrow: `Ordilo Ratgeber · ${guide.topic}`,
    title: guide.title,
    subtitle: "Mit Checkliste und Quellen",
  });
}
