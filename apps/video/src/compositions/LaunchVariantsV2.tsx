import { loadFont } from "@remotion/google-fonts/Figtree";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CSSProperties, ReactNode } from "react";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

const p = {
  paper: "#FDFCFA",
  sand: "#F7F5F1",
  sandLight: "#F1EEE8",
  ink: "#262421",
  muted: "#625D54",
  border: "#D3CEC5",
  petrol: "#305460",
  deep: "#193232",
  apricot: "#E46018",
  sage: "#DDEBE5",
  blue: "#E5EEF1",
  peach: "#F8E7D4",
};

const ease = Easing.bezier(0.23, 1, 0.32, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const useIn = (delay = 0, durationInFrames = 18) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, durationInFrames, config: { damping: 200 } });
};

const range = (frame: number, input: number[], output: number[]) =>
  interpolate(frame, input, output, { ...clamp, easing: ease });

const Mark = ({ size = 62, inverse = false }: { size?: number; inverse?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true">
    <path d="M36 4 63.7 20v32L36 68 8.3 52V20L36 4Z" fill={inverse ? p.paper : p.sand} stroke={inverse ? p.paper : p.petrol} strokeWidth="2.6" strokeLinejoin="round" />
    <path d="M10 22 36 7v58L10 50V22Z" fill={p.petrol} opacity="0.1" />
    <path d="M36 7 62 22v13L36 20V7Z" fill={p.sage} />
    <path d="M28 19C38 16 47 21 49 30c1 4 0 8 3 11 2 2 5 3 7 1 2-2 1-6 2-9 1-3 3-4 5-3 2 1 2 3 0 4 0 6-1 12-6 15-6 3-12 0-15-5-3 4-8 6-14 5-8-1-13-7-13-15 0-9 6-16 10-15Z" fill={p.paper} stroke={p.deep} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M28 20c-8-2-14 4-14 13 0 8 5 13 12 12 7-1 10-7 9-14-1-6-3-10-7-11Z" fill={p.sage} stroke={p.deep} strokeWidth="2.25" />
    <circle cx="42" cy="29" r="1.7" fill={p.deep} />
    <path d="M49 36c2.6 0 3.5 1.8 1.4 3.9" stroke={p.apricot} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ThinkingElephant = ({ progress, frame }: { progress: number; frame: number }) => {
  const trunk = Math.sin(frame / 3.5) * 5;
  const bob = Math.sin(frame / 5) * 3;
  return (
    <div style={{ position: "relative", width: 220, height: 220, opacity: progress, transform: `translateY(${bob}px) scale(${range(progress, [0, 1], [0.9, 1])})` }}>
      <svg width="220" height="220" viewBox="0 0 68 68" fill="none">
        <path d="M15 34C15 23 23 15 35 15c10.5 0 17 7.5 17 18.5C52 43 46 50 37 50H24c-6.5 0-12-4-12-9.5 0-2.7 1-4.9 3-6.5Z" fill={p.sage} stroke={p.petrol} strokeWidth="2" />
        <path d="M29.5 20C21 17.8 15.5 23.7 15.5 32.2c0 8.1 5 13.3 11.7 11.8 5.9-1.3 9-6.4 8.2-12.9-.6-4.9-2.4-9-5.9-11.1Z" fill={p.blue} stroke={p.petrol} strokeWidth="2" />
        <circle cx="43" cy="28" r="1.8" fill={p.petrol} />
        <path d="M21 48v6m7-4v5m10-5v5m7-8v7" stroke={p.petrol} strokeWidth="2.4" strokeLinecap="round" />
        <g style={{ transform: `rotate(${trunk}deg)`, transformOrigin: "49.5px 33px" }}>
          <path d="M49.5 33c.5 5.5 3.2 9.7 6.8 9.4 3.9-.3 5.2-4 4.7-7.7-.4-3.1.8-5.5 3.2-5" stroke={p.petrol} strokeWidth="2.6" strokeLinecap="round" />
        </g>
        <path d="M49.2 36.3c2.6.3 3.5 2.3 1.3 4.5" stroke={p.apricot} strokeWidth="1.55" strokeLinecap="round" />
      </svg>
      {[0, 1, 2].map((i) => <div key={i} style={{ position: "absolute", width: 13 + i * 6, height: 13 + i * 6, borderRadius: "50%", left: 166 + i * 21, top: 17 - i * 14, backgroundColor: i === 2 ? p.apricot : p.blue, opacity: range(progress, [0, 1], [0, 0.8]) }} />)}
    </div>
  );
};

const Brand = ({ inverse = false }: { inverse?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <Mark inverse={inverse} />
    <span style={{ color: inverse ? p.paper : p.deep, fontSize: 40, fontWeight: 600, letterSpacing: -1.6 }}>Ordilo</span>
  </div>
);

const Canvas = ({ dark = false }: { dark?: boolean }) => (
  <AbsoluteFill style={{ backgroundColor: dark ? p.deep : p.paper, overflow: "hidden" }}>
    <div style={{ position: "absolute", width: 650, height: 650, borderRadius: "50%", left: -340, top: 470, backgroundColor: dark ? p.petrol : p.blue, opacity: 0.82 }} />
    <div style={{ position: "absolute", width: 480, height: 480, borderRadius: "50%", right: -190, bottom: 210, backgroundColor: dark ? p.sage : p.peach, opacity: dark ? 0.13 : 0.9 }} />
  </AbsoluteFill>
);

const Headline = ({ children, inverse = false, style }: { children: ReactNode; inverse?: boolean; style?: CSSProperties }) => (
  <div style={{ color: inverse ? p.paper : p.ink, fontSize: 88, fontWeight: 600, letterSpacing: -3.5, lineHeight: 0.96, ...style }}>{children}</div>
);

const Document = ({ progress = 1, compact = false }: { progress?: number; compact?: boolean }) => (
  <div style={{ width: compact ? 230 : 520, height: compact ? 300 : 680, padding: compact ? 20 : 42, borderRadius: compact ? 12 : 20, backgroundColor: p.paper, border: `1px solid ${p.border}`, boxShadow: "0 12px 16px rgba(38,36,33,0.07)", opacity: progress, transform: `scale(${range(progress, [0, 1], [0.93, 1])})` }}>
    <div style={{ display: "flex", gap: compact ? 10 : 17, alignItems: "center" }}>
      <div style={{ width: compact ? 28 : 52, height: compact ? 28 : 52, borderRadius: compact ? 8 : 12, backgroundColor: p.blue }} />
      <div><div style={{ width: compact ? 105 : 240, height: compact ? 9 : 18, borderRadius: 9, backgroundColor: p.ink }} /><div style={{ width: compact ? 75 : 150, height: compact ? 7 : 12, marginTop: compact ? 7 : 12, borderRadius: 7, backgroundColor: p.border }} /></div>
    </div>
    <div style={{ height: 1, margin: compact ? "18px 0" : "36px 0", backgroundColor: p.border }} />
    {[1, 2, 3, 4, 5].map((n) => <div key={n} style={{ width: n === 2 || n === 5 ? "72%" : "100%", height: compact ? 7 : 13, marginTop: n === 1 ? 0 : compact ? 10 : 18, borderRadius: 8, backgroundColor: p.sandLight }} />)}
    <div style={{ width: "62%", height: compact ? 26 : 50, marginTop: compact ? 22 : 48, borderRadius: 12, backgroundColor: p.peach }} />
  </div>
);

const ScannerPhone = ({ scan, recognized }: { scan: number; recognized: number }) => (
  <div style={{ position: "relative", width: 650, height: 910, padding: "96px 35px 35px", borderRadius: 64, border: "15px solid #171716", backgroundColor: p.deep, boxShadow: "0 16px 16px rgba(38,36,33,0.12)", overflow: "hidden" }}>
    <div style={{ position: "absolute", left: "50%", top: 20, width: 180, height: 42, borderRadius: 24, transform: "translateX(-50%)", backgroundColor: "#000" }} />
    <div style={{ position: "absolute", top: 31, left: 32, color: p.paper, fontSize: 20, fontWeight: 600 }}>9:41</div>
    <div style={{ position: "relative", height: 730, borderRadius: 24, overflow: "hidden", backgroundColor: p.sand }}>
      <div style={{ position: "absolute", top: 26, left: 42, transform: "rotate(-2deg) scale(0.95)", transformOrigin: "top left" }}><Document /></div>
      <div style={{ position: "absolute", zIndex: 3, left: 22, right: 22, top: range(scan, [0, 1], [28, 695]), height: 6, backgroundColor: p.apricot, boxShadow: `0 0 18px ${p.apricot}` }} />
      {[
        { left: 18, top: 18, borderWidth: "3px 0 0 3px" },
        { right: 18, top: 18, borderWidth: "3px 3px 0 0" },
        { left: 18, bottom: 18, borderWidth: "0 0 3px 3px" },
        { right: 18, bottom: 18, borderWidth: "0 3px 3px 0" },
      ].map((corner, index) => <div key={index} style={{ position: "absolute", zIndex: 4, width: 52, height: 52, borderStyle: "solid", borderColor: p.paper, ...corner }} />)}
      <div style={{ position: "absolute", zIndex: 5, left: 26, right: 26, bottom: 24, display: "flex", gap: 10, opacity: recognized, transform: `translateY(${range(recognized, [0, 1], [24, 0])}px)` }}>
        {["Vertrag", "Lea", "30. September"].map((label, index) => <div key={label} style={{ padding: "11px 15px", borderRadius: 999, backgroundColor: index === 2 ? p.apricot : p.paper, color: index === 2 ? p.paper : p.petrol, fontSize: 17, fontWeight: 600 }}>{label}</div>)}
      </div>
    </div>
  </div>
);

const Calendar = ({ progress, label = "30. Sept." }: { progress: number; label?: string }) => (
  <div style={{ width: 280, padding: 24, borderRadius: 16, backgroundColor: p.paper, border: `1px solid ${p.border}`, opacity: progress, transform: `translateY(${range(progress, [0, 1], [42, 0])}px)` }}>
    <div style={{ color: p.apricot, fontSize: 20, fontWeight: 600 }}>Erinnerung</div>
    <div style={{ color: p.ink, fontSize: 35, fontWeight: 600, marginTop: 8 }}>{label}</div>
    <div style={{ color: p.muted, fontSize: 18, marginTop: 8 }}>Vertrag kündigen</div>
  </div>
);

const Task = ({ progress, name = "Lea" }: { progress: number; name?: string }) => (
  <div style={{ width: 350, padding: 24, borderRadius: 16, backgroundColor: p.sage, opacity: progress, transform: `translateY(${range(progress, [0, 1], [42, 0])}px)` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: `3px solid ${p.petrol}` }} />
      <div style={{ flex: 1, color: p.deep, fontSize: 22, fontWeight: 600 }}>Vertrag kündigen</div>
      <div style={{ width: 46, height: 46, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: p.peach, color: p.petrol, fontSize: 18, fontWeight: 600 }}>{name[0]}</div>
    </div>
  </div>
);

const KnowledgeTile = ({ progress, kind, value }: { progress: number; kind: string; value: string }) => (
  <div style={{ width: 310, padding: 21, borderRadius: 16, backgroundColor: p.paper, border: `1px solid ${p.border}`, opacity: progress, transform: `translateY(${range(progress, [0, 1], [34, 0])}px) scale(${range(progress, [0, 1], [0.94, 1])})` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: p.petrol, backgroundColor: kind === "Fahrradnummer" ? p.peach : kind === "Zugangsdaten" ? p.blue : p.sage, fontSize: 19, fontWeight: 600 }}>{kind[0]}</div>
      <div><div style={{ color: p.muted, fontSize: 15 }}>{kind}</div><div style={{ color: p.ink, fontSize: 20, fontWeight: 600, marginTop: 3 }}>{value}</div></div>
    </div>
  </div>
);

const Answer = ({ progress }: { progress: number }) => (
  <div style={{ width: 650, padding: 32, borderRadius: 20, backgroundColor: p.sand, border: `1px solid ${p.border}`, opacity: progress, transform: `translateY(${range(progress, [0, 1], [44, 0])}px)` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: p.petrol, fontSize: 20, fontWeight: 600 }}><Mark size={28} />Ordilo antwortet</div>
    <div style={{ color: p.petrol, fontSize: 45, fontWeight: 600, marginTop: 22 }}>Zum 30. September.</div>
    <div style={{ color: p.muted, fontSize: 23, marginTop: 14 }}>Mit Fundstelle im Mobilfunkvertrag.</div>
  </div>
);

const OrbitItem = ({ angle, radius, progress, children }: { angle: number; radius: number; progress: number; children: ReactNode }) => {
  const x = Math.cos(angle) * radius * progress;
  const y = Math.sin(angle) * radius * progress;
  return <div style={{ position: "absolute", left: "50%", top: "50%", opacity: progress, transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${range(progress, [0, 1], [0.82, 1])})` }}>{children}</div>;
};

export const AppStoreStoryV2 = () => {
  const frame = useCurrentFrame();
  const intro = range(frame, [0, 12, 92, 110], [0, 1, 1, 0]);
  const ingest = range(frame, [95, 112, 234, 252], [0, 1, 1, 0]);
  const transform = range(frame, [236, 252, 390, 408], [0, 1, 1, 0]);
  const ask = range(frame, [394, 410, 530, 548], [0, 1, 1, 0]);
  const finish = range(frame, [534, 552, 644, 660], [0, 1, 1, 0]);
  const docIn = useIn(15, 18);
  const scan = range(frame, [120, 150, 178, 214], [0, 1, 0, 1]);
  const recognized = useIn(186, 14);
  const outputs = [useIn(276, 16), useIn(286, 16), useIn(296, 16)];
  const answer = useIn(468, 16);
  const question = "Wann kann ich Leas Vertrag kündigen?";
  const typed = question.slice(0, Math.floor(range(frame, [410, 452], [0, question.length])));
  const thinking = range(frame, [446, 456, 472, 482], [0, 1, 1, 0]);
  const knowledge = [useIn(560, 14), useIn(568, 14), useIn(576, 14), useIn(584, 14)];

  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Canvas />
      <div style={{ position: "absolute", top: 78, left: 72 }}><Brand /></div>

      <AbsoluteFill style={{ opacity: intro }}>
        <Headline style={{ position: "absolute", top: 300, left: 72, right: 72, fontSize: 104 }}>Ein Brief.<br />Fünf Dinge<br />im Kopf.</Headline>
        <div style={{ position: "absolute", top: 840, left: 300, transform: `rotate(${range(docIn, [0, 1], [-10, -3])}deg)` }}><Document progress={docIn} /></div>
        {["Frist", "Aufgabe", "Termin", "Person", "Antwort"].map((word, i) => <div key={word} style={{ position: "absolute", left: 80 + (i % 2) * 560, top: 1050 + Math.floor(i / 2) * 120, color: i === 0 ? p.apricot : p.muted, fontSize: 26, fontWeight: 600, opacity: range(frame, [34 + i * 5, 46 + i * 5], [0, 1]) }}>{word}</div>)}
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: ingest }}>
        <Headline style={{ position: "absolute", top: 205, left: 72, right: 72 }}>Ein Scan.<br /><span style={{ color: p.petrol }}>Ordilo übernimmt.</span></Headline>
        <div style={{ position: "absolute", top: 590, left: 215, transform: "scale(0.84)", transformOrigin: "top left" }}><ScannerPhone scan={scan} recognized={recognized} /></div>
        <div style={{ position: "absolute", left: 125, bottom: 125, color: p.muted, fontSize: 25, opacity: recognized }}>Ordilo erkennt Vertrag, Person und Frist.</div>
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: transform }}>
        <Headline style={{ position: "absolute", top: 165, left: 72, right: 72, fontSize: 82 }}>Aus Papier wird<br /><span style={{ color: p.petrol }}>ein Plan.</span></Headline>
        <div style={{ position: "absolute", top: 610, left: 220 }}><Document compact /></div>
        <svg width="1080" height="1920" style={{ position: "absolute", inset: 0 }}>
          <path d="M560 890 C650 780 690 700 755 650 M560 905 C680 930 710 1060 780 1100 M530 930 C490 1110 350 1190 310 1290" fill="none" stroke={p.border} strokeWidth="3" strokeDasharray="9 10" />
        </svg>
        <div style={{ position: "absolute", top: 510, right: 58 }}><Calendar progress={outputs[0]} /></div>
        <div style={{ position: "absolute", top: 1030, right: 42 }}><Task progress={outputs[1]} /></div>
        <div style={{ position: "absolute", top: 1235, left: 90, opacity: outputs[2] }}><Answer progress={outputs[2]} /></div>
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: ask }}>
        <Headline style={{ position: "absolute", top: 170, left: 72, right: 72, fontSize: 82 }}>Nicht suchen.<br /><span style={{ color: p.petrol }}>Einfach fragen.</span></Headline>
        <div style={{ position: "absolute", top: 590, left: 125, right: 72, minHeight: 42, padding: 28, borderRadius: 20, backgroundColor: p.petrol, color: p.paper, fontSize: 30, fontWeight: 500 }}>{typed}<span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>|</span></div>
        <div style={{ position: "absolute", top: 770, left: 425 }}><ThinkingElephant progress={thinking} frame={frame} /></div>
        <div style={{ position: "absolute", top: 900, left: 72, opacity: answer }}><Answer progress={answer} /></div>
        <div style={{ position: "absolute", top: 1265, left: 72, right: 72, padding: 24, borderRadius: 16, backgroundColor: p.sage, color: p.petrol, fontSize: 22, fontWeight: 600, opacity: answer }}>Originalstelle gefunden · Seite 2</div>
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: finish, backgroundColor: p.deep }}>
        <div style={{ position: "absolute", top: 95, left: 72 }}><Brand inverse /></div>
        <Headline inverse style={{ position: "absolute", top: 280, left: 72, right: 72, fontSize: 88 }}>Alles an<br />einem Ort.</Headline>
        <div style={{ position: "absolute", top: 650, left: 72, right: 72, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <KnowledgeTile progress={knowledge[0]} kind="Dokument" value="Mobilfunkvertrag" />
          <KnowledgeTile progress={knowledge[1]} kind="Fahrradnummer" value="WBY 184 229" />
          <KnowledgeTile progress={knowledge[2]} kind="Zugangsdaten" value="Stromportal" />
          <KnowledgeTile progress={knowledge[3]} kind="Erinnerung" value="30. September" />
        </div>
        <div style={{ position: "absolute", left: 72, right: 72, top: 1160, color: p.sage, fontSize: 34, lineHeight: 1.2, fontWeight: 500, opacity: knowledge[3] }}>Je mehr Ordilo kennt,<br />desto mehr denkt es mit.</div>
        <div style={{ position: "absolute", left: 72, right: 72, bottom: 105, padding: 28, borderRadius: 20, backgroundColor: p.paper, color: p.deep, textAlign: "center", fontSize: 28, fontWeight: 600 }}>Ordilo kostenlos starten</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const FamilyReelV2 = () => {
  const frame = useCurrentFrame();
  const hook = range(frame, [0, 8, 72, 84], [0, 1, 1, 0]);
  const burst = range(frame, [72, 84, 222, 238], [0, 1, 1, 0]);
  const close = range(frame, [224, 240, 344, 360], [0, 1, 1, 0]);
  const orbit = useIn(96, 20);

  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Canvas dark />
      <div style={{ position: "absolute", top: 80, left: 70 }}><Brand inverse /></div>
      <AbsoluteFill style={{ opacity: hook }}>
        <Headline inverse style={{ position: "absolute", top: 360, left: 70, right: 70, fontSize: 112 }}>Du bist<br />nicht die<br />Familien&shy;zentrale.</Headline>
        <div style={{ position: "absolute", left: 70, right: 70, bottom: 190, color: p.sage, fontSize: 34, lineHeight: 1.25, fontWeight: 500 }}>Du musst nicht alles wissen.<br />Nur wissen, wo es ist.</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: burst }}>
        <div style={{ position: "absolute", left: "50%", top: "48%", transform: "translate(-50%, -50%)" }}><Mark size={170} inverse /></div>
        <OrbitItem angle={-2.45} radius={360} progress={orbit}><Document compact /></OrbitItem>
        <OrbitItem angle={-0.65} radius={350} progress={orbit}><Calendar progress={1} /></OrbitItem>
        <OrbitItem angle={0.55} radius={380} progress={orbit}><Task progress={1} /></OrbitItem>
        <OrbitItem angle={2.25} radius={355} progress={orbit}><Answer progress={1} /></OrbitItem>
        <div style={{ position: "absolute", left: 70, top: 260 }}><KnowledgeTile progress={orbit} kind="Fahrradnummer" value="WBY 184 229" /></div>
        <div style={{ position: "absolute", right: 70, top: 1260 }}><KnowledgeTile progress={orbit} kind="Zugangsdaten" value="Stromportal" /></div>
        <div style={{ position: "absolute", left: 70, right: 70, bottom: 115, color: p.paper, fontSize: 58, lineHeight: 1.02, fontWeight: 600, letterSpacing: -2.3, textAlign: "center" }}>Alles, was eure<br />Familie wissen muss.</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: close, backgroundColor: p.paper }}>
        <div style={{ position: "absolute", top: 280, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Mark size={150} /></div>
        <Headline style={{ position: "absolute", top: 580, left: 70, right: 70, fontSize: 102, textAlign: "center" }}>Weniger<br />Papierkram.</Headline>
        <Headline style={{ position: "absolute", top: 830, left: 70, right: 70, color: p.petrol, fontSize: 102, textAlign: "center" }}>Mehr<br />Kopf frei.</Headline>
        <div style={{ position: "absolute", left: 70, right: 70, bottom: 170, padding: 30, borderRadius: 20, backgroundColor: p.petrol, color: p.paper, textAlign: "center", fontSize: 29, fontWeight: 600 }}>Jetzt kostenlos starten</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const HomepageLoopV2 = () => {
  const frame = useCurrentFrame();
  const loop = frame % 300;
  const scan = range(loop, [0, 34, 68, 102], [0, 1, 0, 1]);
  const spread = range(loop, [62, 92], [0, 1]);
  const hold = range(loop, [0, 12, 270, 299], [0, 1, 1, 0]);
  const x = range(scan, [0, 1], [0, 325]);

  return (
    <AbsoluteFill style={{ fontFamily, backgroundColor: p.paper, opacity: hold, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 690, height: 690, borderRadius: "50%", left: -300, top: -245, backgroundColor: p.blue }} />
      <div style={{ position: "absolute", top: 70, left: 92 }}><Brand /></div>
      <Headline style={{ position: "absolute", top: 230, left: 92, width: 560, fontSize: 78 }}>Ein Scan.<br /><span style={{ color: p.petrol }}>Alles geregelt.</span></Headline>
      <div style={{ position: "absolute", left: 730, top: 205 }}><Document compact /></div>
      <div style={{ position: "absolute", left: 650 + x, top: 210, width: 5, height: 290, backgroundColor: p.apricot, boxShadow: `0 0 14px ${p.apricot}` }} />
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, opacity: spread }}>
        <path d="M1040 365 C1190 220 1310 205 1435 220 M1050 400 C1240 410 1340 470 1420 540 M1030 430 C1190 615 1275 730 1410 790" fill="none" stroke={p.border} strokeWidth="3" strokeDasharray="10 11" />
      </svg>
      <div style={{ position: "absolute", left: 1380, top: 130, opacity: spread }}><Calendar progress={spread} /></div>
      <div style={{ position: "absolute", left: 1340, top: 475, opacity: spread }}><Task progress={spread} /></div>
      <div style={{ position: "absolute", left: 1200, top: 735, opacity: spread, transform: "scale(0.78)", transformOrigin: "top left" }}><Answer progress={spread} /></div>
      <div style={{ position: "absolute", left: 900, top: 760, opacity: spread, transform: "scale(0.8)", transformOrigin: "top left" }}><KnowledgeTile progress={spread} kind="Fahrradnummer" value="WBY 184 229" /></div>
      <div style={{ position: "absolute", left: 92, bottom: 82, color: p.muted, fontSize: 25 }}>Dokumente verstehen. Fristen sehen. Familie entlasten.</div>
    </AbsoluteFill>
  );
};
