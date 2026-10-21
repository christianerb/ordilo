// Original text layouts and silent animated video. Requires ffmpeg on PATH.
// Usage: node scripts/render-marketing-stories.cjs /absolute/output/directory
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const React = require("react");
const { ImageResponse } = require("next/og");
const sharp = require("sharp");
const h = React.createElement;
async function main() {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output))
    throw new Error("Provide an absolute output directory");
  const data = JSON.parse(
    await fs.readFile("docs/marketing/social-practical-series.json", "utf8"),
  );
  const font = await fs.readFile("src/assets/fonts/Figtree.ttf");
  const previews = [];
  for (const kind of ["stories", "reel"]) {
    const folder = path.join(output, kind);
    await fs.mkdir(folder, { recursive: true });
    for (const [i, item] of data[kind].entries()) {
      const dark = i % 2 === 0;
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
            justifyContent: "center",
            gap: 54,
            width: "100%",
            height: "100%",
            padding: "270px 90px 320px",
            background: dark ? "#193232" : "#F7F5F1",
            color: dark ? "#FDFCFA" : "#262421",
            fontFamily: "Figtree",
            fontWeight: 600,
          },
        },
        text(item.label || `Ordilo · ${i + 1} / ${data[kind].length}`, {
          fontSize: 28,
          color: dark ? "#F0B4A0" : "#305460",
        }),
        text(item.title, { fontSize: 94, lineHeight: 1.08, letterSpacing: -3 }),
        text(item.body, {
          fontSize: 39,
          lineHeight: 1.5,
          color: dark ? "#D3CEC5" : "#625D54",
        }),
        text("@ordiloapp", { fontSize: 28, marginTop: 60 }),
      );
      const response = new ImageResponse(tree, {
        width: 1080,
        height: 1920,
        fonts: [{ name: "Figtree", data: font, weight: 600, style: "normal" }],
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const name = String(i + 1).padStart(2, "0");
      await fs.writeFile(path.join(folder, `${name}.png`), bytes);
      if (kind === "stories")
        previews.push({
          input: await sharp(bytes).resize(270, 480).toBuffer(),
          left: i * 270,
          top: 0,
        });
      if (kind === "reel") {
        const result = spawnSync(
          "ffmpeg",
          [
            "-y",
            "-loglevel",
            "error",
            "-loop",
            "1",
            "-i",
            path.join(folder, `${name}.png`),
            "-vf",
            "zoompan=z='1+0.00015*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=120:s=1080x1920:fps=30,fade=t=in:st=0:d=0.2,fade=t=out:st=3.8:d=0.2,format=yuv420p",
            "-t",
            "4",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "21",
            path.join(folder, `${name}.mp4`),
          ],
          { encoding: "utf8" },
        );
        if (result.status !== 0)
          throw new Error(result.stderr || "ffmpeg failed");
      }
    }
    await fs.writeFile(
      path.join(folder, "text-und-alttexte.txt"),
      data[kind].map((x, i) => `${i + 1}. ${x.title}\n${x.body}`).join("\n\n"),
    );
  }
  const reelFolder = path.join(output, "reel");
  await fs.writeFile(
    path.join(reelFolder, "concat.txt"),
    data.reel
      .map((_, i) => `file '${String(i + 1).padStart(2, "0")}.mp4'`)
      .join("\n"),
  );
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      path.join(reelFolder, "concat.txt"),
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      path.join(reelFolder, "ordilo-mental-load.mp4"),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || "Video concatenation failed");
  await fs.writeFile(
    path.join(reelFolder, "caption.txt"),
    "Du bist kein Familien-Helpdesk. Denkarbeit sichtbar machen, ganze Vorgänge übernehmen, gemeinsam vereinfachen: Welchen einen Schritt probiert ihr diese Woche? Ordilo hilft beim Dokumententeil. #MentalLoad #Familienorganisation #Elternalltag #CareArbeit #Ordilo\n",
  );
  await fs.writeFile(
    path.join(output, "README.txt"),
    "Vier einzeln teilbare Stories: 1080 × 1920. Reel: 24 Sekunden, 1080 × 1920, 30 fps, bewusst ohne Ton; alle Aussagen stehen im Bild. Optional Musik direkt in Instagram ergänzen. Keine Veröffentlichung oder Planung erfolgt. Links zu neuen Guides erst nach Deployment ergänzen.\n",
  );
  await sharp({
    create: { width: 1080, height: 480, channels: 3, background: "#F7F5F1" },
  })
    .composite(previews)
    .png()
    .toFile(path.join(output, "stories-vorschau.png"));
  console.log(`Rendered stories and reel to ${output}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
