// Render original text layouts; no external services or private data are used.
// Usage: node scripts/render-marketing-carousels.cjs /absolute/output/directory
const fs = require("node:fs/promises");
const path = require("node:path");
const React = require("react");
const { ImageResponse } = require("next/og");
const sharp = require("sharp");
const h = React.createElement;

async function main() {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output))
    throw new Error("Provide an absolute output directory");
  const packs = JSON.parse(
    await fs.readFile("docs/marketing/instagram-listicles.json", "utf8"),
  );
  const font = await fs.readFile("src/assets/fonts/Figtree.ttf");
  const previews = [];
  for (const pack of packs) {
    const folder = path.join(output, pack.id);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, "caption.txt"), pack.caption + "\n");
    await fs.writeFile(
      path.join(folder, "alt-text.txt"),
      pack.slides
        .map(
          (slide, i) =>
            `${i + 1}. ${slide.title.replaceAll("\n", " ")} ${slide.body.replaceAll("\n", " ")} ${slide.example || ""}`,
        )
        .join("\n\n"),
    );
    for (const [index, slide] of pack.slides.entries()) {
      const dark = slide.kind === "cover" || slide.kind === "end";
      const background = dark ? "#193232" : index % 2 ? "#F7F5F1" : "#EFE8DC";
      const foreground = dark ? "#FDFCFA" : "#262421";
      const muted = dark ? "#D3CEC5" : "#625D54";
      const text = (value, style) =>
        h(
          "div",
          { style: { display: "flex", whiteSpace: "pre-wrap", ...style } },
          value,
        );
      const tree = h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "76px 80px",
            background,
            color: foreground,
            fontFamily: "Figtree",
            fontWeight: 600,
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            },
          },
          text("Ordilo", { fontSize: 38, letterSpacing: -1 }),
          text(
            `${String(index + 1).padStart(2, "0")} / ${pack.slides.length}`,
            { fontSize: 27, color: muted },
          ),
        ),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 38 } },
          text(slide.label, {
            fontSize: 25,
            letterSpacing: 2,
            color: dark ? "#F0B4A0" : "#305460",
          }),
          text(slide.title, {
            fontSize: dark ? 104 : 88,
            lineHeight: 1.03,
            letterSpacing: -4,
          }),
          text(slide.body, { fontSize: 39, lineHeight: 1.4, color: muted }),
          slide.example
            ? text(slide.example, {
                fontSize: 29,
                lineHeight: 1.4,
                padding: 30,
                borderRadius: 20,
                background: dark ? "#305460" : "#FDFCFA",
                color: foreground,
              })
            : null,
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: `1px solid ${muted}`,
              paddingTop: 26,
            },
          },
          text("@ordiloapp", { fontSize: 27 }),
          text(slide.kind === "end" ? "Speichern & ausprobieren" : "Weiter →", {
            fontSize: 25,
            color: muted,
          }),
        ),
      );
      const response = new ImageResponse(tree, {
        width: 1080,
        height: 1350,
        fonts: [{ name: "Figtree", data: font, weight: 600, style: "normal" }],
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const file = path.join(
        folder,
        `${String(index + 1).padStart(2, "0")}.png`,
      );
      await fs.writeFile(file, bytes);
      previews.push({
        input: await sharp(bytes).resize(216, 270).toBuffer(),
        left: index * 216,
        top: packs.indexOf(pack) * 270,
      });
    }
  }
  await sharp({
    create: {
      width: 1512,
      height: packs.length * 270,
      channels: 3,
      background: "#F7F5F1",
    },
  })
    .composite(previews)
    .png()
    .toFile(path.join(output, "uebersicht.png"));
  await fs.writeFile(
    path.join(output, "README.txt"),
    "3 Instagram-Carousels, jeweils 7 PNGs in 1080 × 1350. Reihenfolge 01 bis 07. Captions und Alt-Texte je Ordner. Nicht veröffentlicht oder eingeplant. Artikel-Links erst nach Website-Deployment verwenden.\n",
  );
  console.log(`Rendered ${previews.length} slides to ${output}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
