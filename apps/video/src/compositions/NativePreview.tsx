import { loadFont } from "@remotion/google-fonts/Figtree";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame } from "remotion";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Story beats. Boundaries match the media sequences below (540 frames total). */
const BEATS = [
  { until: 180, words: ["Der", "Zettel", "von", "der", "Kita."], sub: "Die Frage liegt auf der Hand." },
  { until: 300, words: ["Einmal", "tippen."], sub: undefined },
  { until: 480, words: ["Antwort.", "Mit", "Fundstelle."], sub: undefined },
  { until: 540, words: ["Ordilo."], sub: "Für deine Familie." },
] as const;

/** Camera presets per beat: slow push on stills, punch toward composer / quote. */
const CAMERA = [
  { from: 1.02, to: 1.1, origin: "50% 28%" },
  { from: 1.14, to: 1.2, origin: "50% 84%" },
  { from: 1.15, to: 1.24, origin: "50% 44%" },
  { from: 1.08, to: 1.12, origin: "50% 50%" },
] as const;

function beatStart(index: number) {
  return index === 0 ? 0 : BEATS[index - 1].until;
}

function KineticTitle({ frame }: { frame: number }) {
  const i = BEATS.findIndex(b => frame < b.until);
  const beat = BEATS[i];
  const local = frame - beatStart(i);
  return <div>
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: 20 }}>
      {beat.words.map((word, wi) => {
        const p = spring({ fps: 30, frame: local - wi * 6, config: { damping: 19, stiffness: 170 } });
        return <span key={`${i}-${wi}`} style={{
          display: "inline-block", fontSize: 68, fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.03em",
          color: word.startsWith("Ordilo") ? "#305460" : "#262421",
          opacity: Math.min(1, Math.max(0, p)), transform: `translateY(${(1 - p) * 30}px) scale(${0.88 + p * 0.12})`,
        }}>{word}</span>;
      })}
    </div>
    {beat.sub && <div style={{ marginTop: 16, fontSize: 36, color: "#625D54", opacity: interpolate(local, [beat.words.length * 6, beat.words.length * 6 + 12], [0, 1], clamp) }}>{beat.sub}</div>}
  </div>;
}

/** Real local-example footage only. No reconstructed controls or synthetic app results. */
export function NativePreview() {
  const frame = useCurrentFrame();
  const i = BEATS.findIndex(b => frame < b.until);
  const cam = CAMERA[i];
  const scale = interpolate(frame, [beatStart(i), BEATS[i].until], [cam.from, cam.to], clamp);
  return <AbsoluteFill style={{ background: "#FDFCFA", fontFamily, color: "#262421" }}>
    <div style={{ position: "absolute", left: 58, right: 58, top: 70 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
        <div style={{ fontSize: 28, color: "#305460", fontWeight: 500 }}>Ordilo · Beispiel in der App</div>
        <div style={{ display: "flex", gap: 9 }}>
          {BEATS.map((_, di) => <div key={di} style={{ width: 10, height: 10, borderRadius: 5, background: di <= i ? "#305460" : "#D3CEC5" }} />)}
        </div>
      </div>
      <KineticTitle frame={frame} />
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 350, height: 1420, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: cam.origin }}>
        <Sequence from={0} durationInFrames={180} premountFor={30}>
          <Img src={staticFile("campaign/native-letter.png")} style={{ width: 886, position: "absolute", top: -540 }} />
        </Sequence>
        <Sequence from={180} durationInFrames={120} premountFor={30}>
          <OffthreadVideo src={staticFile("campaign/native-example-raw.mp4")} startFrom={Math.round(15.8 * 30)} muted style={{ width: 886, position: "absolute", top: -540 }} />
        </Sequence>
        <Sequence from={300} durationInFrames={240} premountFor={30}>
          <Img src={staticFile("campaign/native-answer.png")} style={{ width: 886, position: "absolute", top: -540, opacity: interpolate(frame, [300, 308], [0, 1], { extrapolateRight: "clamp" }) }} />
        </Sequence>
      </div>
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 1px #D3CEC5", pointerEvents: "none" }} />
    </div>
    <div style={{ position: "absolute", left: 58, right: 58, bottom: 68, fontSize: 30, lineHeight: 1.3, color: "#625D54" }}>
      {i === 3 ? "Mehr auf ordilo.de" : <>Direkt aus Ordilo aufgenommen.<br />Das vorbereitete Beispiel speichert keine Daten.</>}
    </div>
    <div style={{ position: "absolute", left: 0, top: 0, height: 6, width: `${(frame / 540) * 100}%`, background: "#305460" }} />
  </AbsoluteFill>;
}
