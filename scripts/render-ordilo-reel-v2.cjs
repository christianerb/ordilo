// Original illustrated motion composition. Usage: node scripts/render-ordilo-reel-v2.cjs /absolute/output
// Requires ffmpeg and fontconfig. No application state or customer data is used.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const root = path.resolve(__dirname, "..");
const W = 1080,
  H = 1920,
  FPS = 30,
  DURATION = 23;
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const spring = (x) => (x < 0 ? 0 : 1 - Math.exp(-7 * x) * Math.cos(11 * x));
const text = (x, y, str, size = 50, color = "#193232", anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="Figtree" font-weight="600" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(str)}</text>`;
const rect = (x, y, w, h, fill, rx = 30) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const group = (x, y, s, content, angle = 0, opacity = 1) =>
  `<g opacity="${opacity}" transform="translate(${x} ${y}) rotate(${angle}) scale(${s})">${content}</g>`;
function check(x, y, p) {
  return `<circle cx="${x}" cy="${y}" r="34" fill="#D6E4D2"/><path d="M${x - 15} ${y} l11 12 23 -26" fill="none" stroke="#193232" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="55" stroke-dashoffset="${55 * (1 - clamp(p))}"/>`;
}
function pill(x, y, label, fill = "#EEDCC3", color = "#193232", w = 340) {
  return (
    rect(x, y, w, 62, fill, 31) +
    text(x + w / 2, y + 42, label, 29, color, "middle")
  );
}
function pointer(x, y, t) {
  return `<circle cx="${x}" cy="${y}" r="${22 + 45 * clamp(t)}" fill="none" stroke="#E46018" stroke-width="5" opacity="${1 - clamp(t)}"/><circle cx="${x}" cy="${y}" r="16" fill="#E46018"/>`;
}
function heart(x, y, scale, color = "#DB795A") {
  return group(
    x,
    y,
    scale,
    '<path d="M0 12 C-40 -20 -50 30 0 62 C50 30 40 -20 0 12Z" fill="' +
      color +
      '"/>',
  );
}
function frame(t, family) {
  let scene = t < 4 ? 0 : t < 8 ? 1 : t < 14 ? 2 : t < 18 ? 3 : 4;
  let local = t - [0, 4, 8, 14, 18][scene];
  let out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#193232" flood-opacity="0.08"/></filter></defs>`;
  out += rect(0, 0, W, H, scene === 4 ? "#E4ECDF" : "#F7F5F1", 0);
  out += `<circle cx="${900 + 30 * Math.sin(t)}" cy="950" r="570" fill="${scene === 4 ? "#D3E0CF" : "#EFE8DC"}"/><circle cx="60" cy="1300" r="280" fill="#F2DFD3" opacity="0.6"/>`;
  out +=
    text(90, 175, "Ordilo", 39) +
    pill(655, 133, "Familienalltag", "#EFE8DC", "#305460", 325);
  const illustration = (x, y, size, angle = 0) =>
    group(
      x,
      y,
      1,
      `<image href="${family}" width="${size}" height="${size}"/>`,
      angle,
    );
  if (scene === 0) {
    out +=
      text(90, 320, "Mein Kopf:", 88) + text(90, 422, "27 Tabs offen.", 88);
    out += group(
      90,
      480,
      1,
      text(0, 0, "Einer spielt Flöte.", 44, "#71685C"),
      0,
      ease((local - 0.8) * 2),
    );
    const tasks = [
      ["Kita-Brief?!", 125, 580, -6, "#FDFCFA"],
      ["Turnbeutel!", 515, 730, 5, "#EBC39B"],
      ["Wer holt ab?", 120, 850, -3, "#FDFCFA"],
    ];
    tasks.forEach(([label, x, y, angle, bg], i) => {
      const p = spring(local - i * 0.45);
      out += group(
        x + (1 - p) * 700,
        y + Math.sin(local * 2 + i) * 12,
        Math.max(0.01, p),
        rect(0, 0, 410, 125, bg, 25) + text(35, 79, label, 43),
        angle,
      );
    });
    out += illustration(
      175,
      1000 + Math.sin(local * 2) * 7,
      750,
      -1 + Math.sin(local) * 0.6,
    );
    if (local > 1) {
      out += text(865, 1110 + Math.sin(local * 4) * 20, "♪", 70, "#DB795A");
      out += text(100, 1190 + Math.cos(local * 3) * 15, "♫", 55, "#305460");
    }
  } else if (scene === 1) {
    out +=
      text(90, 320, "Der Ausflug?", 80) + text(90, 416, "Erst morgen.", 80);
    const p = spring(local * 1.2);
    let card =
      rect(0, 0, 850, 770, "#FDFCFA", 35) +
      pill(50, 45, "Kita · Beispiel", "#EFE8DC", "#305460", 330) +
      text(50, 185, "Unser Ausflug", 59) +
      text(50, 265, "Treffpunkt: morgen, 9:00", 38, "#625D54");
    for (let i = 0; i < 3; i++)
      card += rect(50, 315 + i * 42, 600 - i * 90, 12, "#E6E1D9", 6);
    card +=
      rect(40, 495, 770, 190, "#F8E4D8", 25) +
      text(75, 560, "Rückmeldung:", 40) +
      text(75, 637, "bitte HEUTE abgeben.", 48, "#A74A24");
    out += group(115, 540 + (1 - p) * 600, 1, card, -2 + 2 * ease(local));
    if (local > 0.8) {
      out += `<rect x="155" y="${620 + ((local - 0.8) % 1.8) * 310}" width="770" height="7" rx="3" fill="#305460" opacity="${local < 2.5 ? 0.45 : 0}"/>`;
    }
    out += group(
      120,
      1420,
      1,
      text(0, 0, "Morgen ist nicht die Frist.", 47),
      0,
      ease(local - 1.5),
    );
    out += text(120, 1490, "Kurz am Original prüfen.", 38, "#625D54");
  } else if (scene === 2) {
    out +=
      text(90, 320, "Ein Brief.", 88) +
      text(90, 420, "Drei klare Schritte.", 75);
    const rows = [
      ["1", "Gemeinsam ablegen", "Damit beide die Infos finden."],
      ["2", "Frist am Original prüfen", "Ausflug ≠ Rückgabe."],
      ["3", "Übernahme absprechen", "Wer macht den nächsten Schritt?"],
    ];
    rows.forEach(([num, title, sub], i) => {
      let p = spring(local - i * 1.35);
      let y = 570 + i * 270;
      out += group(
        90 + (1 - p) * 1000,
        y,
        1,
        rect(0, 0, 900, 225, "#FDFCFA", 30) +
          pill(30, 30, num, "#EFE8DC", "#193232", 65) +
          text(125, 79, title, 43) +
          text(125, 147, sub, 34, "#625D54"),
      );
      if (local > i * 1.35 + 0.6)
        out += check(920, y + 56, (local - i * 1.35 - 0.6) * 3);
    });
    let step = Math.min(2, Math.floor(local / 1.35));
    if (local < 4.5)
      out += pointer(900, 675 + step * 270, (local % 1.35) / 1.35);
    out += group(
      100,
      1490,
      1,
      text(0, 0, "Eine Ablage hilft. Die Zusage zählt.", 40),
      0,
      ease(local - 3.8),
    );
  } else if (scene === 3) {
    out +=
      text(90, 320, "Nicht: „Mach mal.“", 72) +
      text(90, 416, "Sondern: „Ich mach’s.“", 72);
    let p = spring(local * 1.4);
    out += group(
      90,
      550 + (1 - p) * 200,
      1,
      rect(0, 0, 900, 390, "#FDFCFA", 32) +
        text(45, 80, "Rückmeldung abgeben", 49) +
        pill(45, 125, "Heute", "#F8E4D8", "#A74A24", 180) +
        text(45, 260, "Sam übernimmt.", 55) +
        text(45, 325, "Bis zur Abgabe. Mit Rückmeldung.", 35, "#625D54"),
    );
    if (local > 0.8) out += check(900, 808, ease(local - 0.8));
    out += illustration(225, 1080 + Math.sin(local * 2) * 7, 650);
    out += group(
      120,
      1010,
      Math.max(0.01, spring(local - 0.4)),
      pill(0, 0, "„Danke. Wirklich.“", "#193232", "#FDFCFA", 420),
    );
    for (let i = 0; i < 3; i++)
      if (local > 1 + i * 0.3)
        out += heart(
          830 + i * 35,
          1150 - (local - 1 - i * 0.3) * 100,
          0.45 + i * 0.1,
        );
  } else {
    out +=
      text(90, 320, "Weniger", 84) +
      text(90, 421, "„Denkst du dran?“", 78) +
      text(90, 535, "Mehr zusammen.", 72, "#305460");
    out += illustration(110, 700 + Math.sin(local * 1.8) * 7, 860);
    for (let i = 0; i < 5; i++) {
      let a = i * 1.3 + local * 0.4;
      out += heart(
        150 + i * 190,
        680 + Math.sin(a) * 70,
        0.3 + 0.15 * Math.sin(a),
      );
    }
    out += group(
      90,
      1510,
      1,
      pill(0, 0, "Ordilo für euren Papierkram.", "#193232", "#FDFCFA", 900),
    );
    out += text(
      540,
      1650,
      "Welche Aufgabe teilt ihr heute?",
      38,
      "#305460",
      "middle",
    );
  }
  out +=
    text(90, 1800, "@ordiloapp", 30, "#625D54") +
    text(990, 1800, "Illustration · Alltagsbeispiel", 24, "#625D54", "end");
  out +=
    rect(90, 1830, 900, 5, "#DED8CF", 2) +
    rect(90, 1830, (900 * t) / DURATION, 5, "#305460", 2);
  // A short moving wipe connects scenes, rather than a static slide crossfade.
  if (scene > 0 && local < 0.28)
    out += rect(1080 * ease(local / 0.28), 0, 1080, H, "#EEDCC3", 0);
  return out + "</svg>";
}
function soundtrack() {
  const rate = 48000,
    samples = new Float32Array(rate * DURATION);
  function tone(start, len, freq, amp, kind = "bell") {
    for (let j = 0; j < Math.floor(len * rate); j++) {
      const t = j / rate;
      const idx = Math.floor(start * rate) + j;
      if (idx >= samples.length) break;
      const envelope =
        Math.min(1, t / 0.012) *
        Math.pow(1 - t / len, kind === "flute" ? 1 : 3);
      const wave =
        kind === "flute"
          ? Math.sin(2 * Math.PI * (freq + 2 * Math.sin(t * 28)) * t)
          : Math.sin(2 * Math.PI * freq * t) +
            0.23 * Math.sin(2 * Math.PI * freq * 2.003 * t);
      samples[idx] += amp * envelope * wave;
    }
  }
  // Original playful flute phrase, soft marimba-like pulses and UI confirmations.
  [523.25, 587.33, 659.25, 587.33, 783.99].forEach((f, i) =>
    tone(1.3 + i * 0.18, 0.25, f, 0.07, "flute"),
  );
  for (let i = 0; i < 23; i++) {
    tone(i, 0.48, [261.63, 329.63, 392, 329.63][i % 4], 0.035);
    if (i % 2 === 0) tone(i + 0.5, 0.32, 523.25, 0.025);
  }
  [0, 0.45, 0.9, 4, 8, 9.35, 10.7, 14.8, 18].forEach((s) => {
    tone(s, 0.13, 540, 0.1);
    tone(s + 0.05, 0.14, 810, 0.045);
  });
  [18.2, 18.38, 18.56].forEach((s, i) =>
    tone(s, 0.8, [523.25, 659.25, 783.99][i], 0.06),
  );
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) =>
    data.writeInt16LE(
      Math.round(
        Math.max(-1, Math.min(1, v)) *
          32767 *
          Math.min(1, (DURATION - i / rate) / 0.8),
      ),
      i * 2,
    ),
  );
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
async function main() {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output))
    throw new Error("Provide an absolute output directory");
  await fs.mkdir(output, { recursive: true });
  await fs.copyFile(
    path.join(root, "docs/marketing/reel-v2-preview.html"),
    path.join(output, "index.html"),
  );
  await fs.copyFile(
    path.join(root, "src/assets/fonts/Figtree.ttf"),
    path.join(output, "Figtree.ttf"),
  );
  await fs.copyFile(
    path.join(root, "src/assets/fonts/OFL.txt"),
    path.join(output, "Figtree-OFL.txt"),
  );
  const config = path.join(os.tmpdir(), "ordilo-reel-fonts.conf");
  await fs.writeFile(
    config,
    `<?xml version="1.0"?><fontconfig><dir>${esc(path.join(root, "src/assets/fonts"))}</dir><dir>/System/Library/Fonts</dir><cachedir>${esc(path.join(os.tmpdir(), "ordilo-reel-font-cache"))}</cachedir></fontconfig>`,
  );
  process.env.FONTCONFIG_FILE = config;
  const sharp = require("sharp");
  const asset = await fs.readFile(
    path.join(root, "docs/marketing/assets/familie-floete.png"),
  );
  await fs.writeFile(path.join(output, "familie-floete.png"), asset);
  const family = `data:image/png;base64,${asset.toString("base64")}`;
  await fs.writeFile(path.join(output, "soundtrack.wav"), soundtrack());
  const previewTimes = [2.6, 6.7, 12.8, 16.6, 20.8];
  const previews = [];
  for (let i = 0; i < previewTimes.length; i++) {
    const png = await sharp(Buffer.from(frame(previewTimes[i], family)))
      .png()
      .toBuffer();
    await fs.writeFile(path.join(output, `szene-${i + 1}.png`), png);
    previews.push({
      input: await sharp(png).resize(216, 384).toBuffer(),
      left: i * 216,
      top: 0,
    });
  }
  await sharp({
    create: { width: 1080, height: 384, channels: 3, background: "#F7F5F1" },
  })
    .composite(previews)
    .png()
    .toFile(path.join(output, "storyboard.png"));
  const storyCopy = [
    [
      "Wie viele Tabs",
      "hat dein Kopf",
      "gerade offen?",
      "Du bist damit nicht allein.",
    ],
    [
      "Wer übernimmt",
      "heute die",
      "Kita-Post?",
      "Eine klare Zusage ist viel wert.",
    ],
  ];
  for (let i = 0; i < storyCopy.length; i++) {
    const [a, b, c, sub] = storyCopy[i];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">${rect(0, 0, 1080, 1920, i ? "#E4ECDF" : "#F7F5F1", 0)}<circle cx="540" cy="1270" r="490" fill="#EFE8DC"/>${text(90, 190, "Ordilo", 38)}${text(90, 360, a, 82)}${text(90, 460, b, 82)}${text(90, 560, c, 82)}${text(90, 660, sub, 38, "#625D54")}<image href="${family}" x="110" y="960" width="860" height="860"/>${text(90, 1810, "@ordiloapp", 30, "#625D54")}</svg>`;
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(output, `story-${i + 1}.png`));
  }
  await fs.writeFile(
    path.join(output, "story-sticker.txt"),
    "Story 1: Instagram-Umfrage bei ca. 50 % Breite / 42 % Höhe hinzufügen. Frage: Wie viele Tabs? Antworten: 27 / Alle. Story 2: Frage-Sticker an derselben Stelle: Welche Aufgabe teilt ihr heute? Die PNGs enthalten bewusst keinen nachgeahmten klickbaren Sticker. Erst der native Sticker in Instagram macht die Story interaktiv. Nicht veröffentlicht oder terminiert.\n",
  );
  if (process.env.STILLS_ONLY === "1") return;
  const ff = spawn(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      String(FPS),
      "-i",
      "pipe:0",
      "-i",
      path.join(output, "soundtrack.wav"),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "19",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-af",
      "volume=3",
      "-b:a",
      "192k",
      "-t",
      String(DURATION),
      "-movflags",
      "+faststart",
      path.join(output, "ordilo-27-tabs.mp4"),
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const finished = once(ff, "close");
  ff.stdin.on("error", () => {});
  for (let f = 0; f < DURATION * FPS; f += 4) {
    const frames = await Promise.all(
      Array.from({ length: Math.min(4, DURATION * FPS - f) }, (_, i) =>
        sharp(Buffer.from(frame((f + i) / FPS, family)))
          .png()
          .toBuffer(),
      ),
    );
    for (const bytes of frames) {
      if (!ff.stdin.write(bytes)) await once(ff.stdin, "drain");
    }
    if (f % 120 === 0) console.log(`Rendered ${f}/${DURATION * FPS} frames`);
  }
  ff.stdin.end();
  const [code] = await finished;
  if (code !== 0) throw new Error(`ffmpeg exit ${code}`);
  await fs.writeFile(
    path.join(output, "caption.txt"),
    "Mein Kopf: 27 Tabs offen. Einer spielt Flöte. 🎶\n\nEin Kita-Brief, drei kleine Schritte: gemeinsam ablegen, Frist am Original prüfen, Übernahme absprechen. Nicht nur „Kannst du mal?“, sondern „Ich übernehme bis zur Abgabe.“\n\nWelche Aufgabe teilt ihr heute?\n\nOrdilo hilft beim Papierkram. Die Zusage kommt von euch.\n\n#MentalLoad #Familienalltag #Familienorganisation #Elternalltag #Ordilo\n",
  );
  console.log(`Saved reel to ${output}`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
