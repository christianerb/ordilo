import { loadFont } from "@remotion/google-fonts/Figtree";
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame } from "remotion";
import { sceneIntervals } from "./campaign-timing";

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const c = {
  paper: "#FDFCFA", sand: "#F7F5F1", layer: "#F1EEE8", warm: "#EFE8DC",
  ink: "#262421", muted: "#625D54", line: "#D3CEC5", teal: "#305460",
  deep: "#193232", apricot: "#E46018", peach: "#F0B4A0", sage: "#DDEBE5",
};
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const move = (f: number, start: number, end: number, a: number, b: number) =>
  interpolate(f, [start, end], [a, b], { ...clamp, easing: ease });
const linear = (f: number, start: number, end: number, a: number, b: number) =>
  interpolate(f, [start, end], [a, b], clamp);
const settle = (f: number, delay = 0) => spring({ fps: 30, frame: f - delay, config: { damping: 22, stiffness: 140 } });
type StageProps = { wide: boolean; duration: number };

/** End-exclusive scene boundaries. Register at 30fps, 1080×1920 / 1920×1080. */

function Elephant({ size = 180, thinking = false }: { size?: number; thinking?: boolean }) {
  const f = useCurrentFrame();
  const nod = thinking ? Math.sin(f / 13) * 3 : 0;
  const blink = thinking && f % 76 > 70;
  return <svg width={size} height={size} viewBox="0 0 240 240" fill="none" aria-hidden="true">
    <g transform={`translate(0 ${nod})`}>
      <path d="M43 116C36 69 65 39 109 40c46 1 70 30 69 71-1 40-22 68-58 70H75c-25 0-40-21-32-45Z" fill={c.teal} />
      <path d="M64 157v36c0 12 21 12 21 0v-17m41-2v20c0 11 22 11 22 0v-31" fill={c.teal} />
      <path d="M81 57C47 58 43 90 50 119c5 23 21 37 43 28 27-12 30-40 18-64-7-16-16-26-30-26Z" fill={c.sage} />
      <path d="M60 73c18-16 37-4 41 18" stroke={c.paper} strokeWidth="3" opacity=".7" strokeLinecap="round" />
      {blink ? <path d="m142 82 12 0" stroke={c.paper} strokeWidth="5" strokeLinecap="round" /> : <ellipse cx="148" cy="82" rx="5" ry="6" fill={c.paper} />}
      <g transform={`rotate(${thinking ? -12 + Math.sin(f / 11) * 9 : -4} 164 103)`}>
        <path d="M164 103c5 37 19 54 38 44 14-8 16-25 14-43" stroke={c.teal} strokeWidth="19" strokeLinecap="round" />
      </g>
      <path d="M166 115c15 0 14 13 3 19" fill={c.peach} />
      <path d="M45 120c-17 3-21 15-18 25" stroke={c.teal} strokeWidth="6" strokeLinecap="round" />
    </g>
    {thinking && [0, 1, 2].map(i => <circle key={i} cx={181 + i * 18} cy={47 - i * 15} r={4 + i * 2} fill={c.teal} opacity={move(f, 5 + i * 6, 15 + i * 6, 0, 0.45)} />)}
  </svg>;
}

function Brand({ light = false, large = false }: { light?: boolean; large?: boolean }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 15, color: light ? c.paper : c.teal, fontSize: large ? 70 : 40, fontWeight: 600, letterSpacing: "-0.04em" }}>
    <svg width={large ? 78 : 50} height={large ? 78 : 50} viewBox="0 0 60 60" fill="none">
      <path d="m30 3 24 14v27L30 58 6 44V17Z" fill={light ? c.paper : c.teal} />
      <path d="M17 32c0-11 6-16 15-14 8 2 11 8 10 15 1 7 7 8 8 1" stroke={light ? c.teal : c.paper} strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="24" cy="29" rx="8" ry="11" fill={c.sage} />
      <circle cx="36" cy="25" r="1.7" fill={light ? c.teal : c.paper} />
      <path d="m40 34 3 3" stroke={c.peach} strokeWidth="2" />
    </svg>
    Ordilo
  </div>;
}

function Frame({ children, wide, dark = false, first = false }: { children: ReactNode; wide: boolean; dark?: boolean; first?: boolean }) {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{
    fontFamily, color: c.ink, background: c.paper, overflow: "hidden",
    clipPath: first ? undefined : `inset(0 ${move(f, 0, 10, 100, 0)}% 0 0)`,
  }}>
    {children}
    <div style={{ position: "absolute", left: wide ? 100 : 100, top: wide ? 55 : 205 }}><Brand light={dark} /></div>
    <div style={{ position: "absolute", right: 100, top: wide ? 69 : 220, fontSize: wide ? 24 : 28, color: dark ? c.paper : c.muted }}>Beispieldaten</div>
  </AbsoluteFill>;
}

function Title({ children, wide, style }: { children: ReactNode; wide: boolean; style?: CSSProperties }) {
  return <h1 style={{ margin: 0, fontWeight: 600, fontSize: wide ? 100 : 106, lineHeight: 1.02, letterSpacing: "-0.04em", ...style }}>{children}</h1>;
}

function Paper({ small = false, scan = false }: { small?: boolean; scan?: boolean }) {
  return <div style={{ width: "100%", height: "100%", background: c.paper, padding: small ? 30 : 48, border: `1px solid ${c.line}`, borderRadius: 6, color: c.ink, boxSizing: "border-box", boxShadow: "0 4px 16px #26242114" }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: small ? 17 : 24, color: c.muted }}><span>Beispieldaten</span><span>01 / 01</span></div>
    <div style={{ marginTop: small ? 25 : 55, fontSize: small ? 30 : 46, lineHeight: 1.08, fontWeight: 600 }}>Deine Kita</div>
    <div style={{ height: 2, background: c.line, margin: "25px 0" }} />
    <div style={{ fontSize: small ? 20 : 29, lineHeight: 1.6 }}>Mitteilung an die Eltern<br />Ausflug am Freitag</div>
    <div style={{ fontSize: small ? 20 : 30, lineHeight: 1.5, marginTop: small ? 20 : 40, background: scan ? c.sage : c.sand, padding: small ? 16 : 22, borderRadius: 10 }}>
      Bitte gebt euren Kindern<br /><strong style={{ fontWeight: 600 }}>Trinkflasche und Regenjacke mit.</strong>
    </div>
    {[82, 100, 94, 68].map((w, i) => <div key={i} style={{ height: small ? 4 : 6, width: `${w}%`, marginTop: small ? 16 : 23, background: c.line, opacity: .7 }} />)}
    <div style={{ marginTop: small ? 20 : 40, fontSize: small ? 16 : 23, color: c.muted }}>Kita · Mitteilung</div>
  </div>;
}

function ChaosCard({ f, start, x, y, rotate, source, headline, detail, tag }: { f: number; start: number; x: number; y: number; rotate: number; source: string; headline: string; detail?: string; tag: string }) {
  const p = settle(f, start);
  return <div style={{ position: "absolute", left: x, top: y, width: 470, padding: "26px 30px", boxSizing: "border-box", borderRadius: 6, background: c.paper, border: `1px solid ${c.line}`, boxShadow: "0 4px 16px #2624212e", opacity: p, transform: `translate(${(1 - p) * 150}px, ${(1 - p) * 100}px) rotate(${rotate + (1 - p) * 15}deg)` }}>
    <div style={{ fontSize: 23, color: c.muted }}>{source}</div>
    <div style={{ marginTop: 11, fontSize: 31, fontWeight: 600, lineHeight: 1.15 }}>{headline}</div>
    {detail && <div style={{ marginTop: 8, fontSize: 26, lineHeight: 1.3 }}>{detail}</div>}
    <div style={{ marginTop: 18, display: "inline-block", fontSize: 23, fontWeight: 500, color: c.teal, background: "#30546014", border: "1px solid #30546033", borderRadius: 9999, padding: "4px 15px" }}>{tag}</div>
  </div>;
}

function Hook({ wide, duration }: StageProps) {
  const f = useCurrentFrame();
  const stag = wide ? [10, 26, 42] : [7, 17, 27];
  const cards = [
    { source: "Kita · Zettel im Ranzen", headline: "Ausflug am Freitag.", detail: "Trinkflasche und Regenjacke mitgeben.", tag: "Lena" },
    { source: "Fußballverein · Aushang", headline: "Anmeldung bis 12. Juni.", detail: "Sonst ist der Platz weg.", tag: "Ben" },
    { source: "Stadtwerke · Brief", headline: "Abschlag ändert sich.", detail: "Ab September.", tag: "Familie" },
  ];
  const pos = wide
    ? [{ x: 1150, y: 165, rotate: -5 }, { x: 1240, y: 440, rotate: 4 }, { x: 1175, y: 715, rotate: -3 }]
    : [{ x: 105, y: 830, rotate: -6 }, { x: 345, y: 1085, rotate: 4 }, { x: 150, y: 1350, rotate: -2 }];
  return <Frame wide={wide} dark first>
    <AbsoluteFill style={{ transform: `scale(${linear(f, 0, duration, 1.04, 1.12)}) translateX(${linear(f, 0, duration, 10, -10)}px)` }}>
      <Img src={staticFile("campaign/paper-chaos.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
    <AbsoluteFill style={{ background: wide ? "linear-gradient(90deg, #193232f2 0%, #193232cc 44%, #19323259 100%)" : "linear-gradient(180deg, #193232e6 0%, #193232a6 48%, #19323240 100%)" }} />
    <div style={{ position: "absolute", left: 100, top: wide ? 290 : 350, width: wide ? 920 : 880, color: c.paper, transform: `translateY(${move(f, 0, 18, 38, 0)}px)`, opacity: move(f, 0, 12, 0, 1) }}>
      <Title wide={wide} style={{ fontSize: wide ? 118 : 112 }}>{wide ? <>Jede Familie<br />kennt das.</> : <>Familienalltag.<br />In Papierform.</>}</Title>
      <div style={{ marginTop: 40, fontSize: wide ? 40 : 42, lineHeight: 1.32, maxWidth: 700 }}>Kita, Verein, Schule. Alles will<br />gesehen werden. Gleichzeitig.</div>
    </div>
    {cards.map((card, i) => <ChaosCard key={card.tag} f={f} start={stag[i]} x={pos[i].x} y={pos[i].y} rotate={pos[i].rotate} {...card} />)}
  </Frame>;
}

function Scan({ wide, duration }: StageProps) {
  const f = useCurrentFrame();
  const capture = Math.round(duration * .65);
  const phoneX = move(f, 8, capture - 10, wide ? 620 : 420, 0);
  const phoneY = move(f, 8, capture - 10, -200, 0);
  const scanY = linear(f, 26, capture, 4, 95);
  const captured = f >= capture;
  return <Frame wide={wide}>
    <AbsoluteFill style={{ background: c.warm }} />
    <div style={{ position: "absolute", left: 100, top: wide ? 285 : 345, width: wide ? 690 : 880 }}>
      <Title wide={wide}>Einmal<br />festhalten.</Title>
      <div style={{ marginTop: 30, fontSize: 36, color: c.muted, lineHeight: 1.4 }}>Ein Foto. Und der Zettel<br />hat seinen Platz.</div>
      {wide && <div style={{ marginTop: 90, display: "flex", alignItems: "center", gap: 22, fontSize: 30, color: c.teal }}><span style={{ width: 45, height: 2, background: c.teal }} /> Vom Papier ins Familiengedächtnis.</div>}
    </div>
    <div style={{ position: "absolute", left: wide ? 1020 : 240, top: wide ? 205 : 860, width: wide ? 560 : 580, height: wide ? 720 : 690, transform: "rotate(-8deg)" }}><Paper scan={captured} /></div>
    <div style={{ position: "absolute", left: wide ? 1115 : 318, top: wide ? 180 : 780, width: 400, height: 740, padding: 13, boxSizing: "border-box", borderRadius: 28, background: c.deep, boxShadow: "0 4px 16px #26242122", transform: `translate(${phoneX}px, ${phoneY}px) rotate(${move(f, 8, capture - 10, 18, 0)}deg)` }}>
      <div style={{ height: "100%", borderRadius: 20, overflow: "hidden", position: "relative", background: c.warm }}>
        <div style={{ position: "absolute", width: 75, height: 13, borderRadius: 10, background: c.deep, top: 12, left: 150, zIndex: 3 }} />
        <div style={{ position: "absolute", inset: "72px 19px 130px" }}><Paper small scan={captured} /></div>
        <div style={{ position: "absolute", inset: "65px 14px 125px", border: `3px solid ${captured ? c.teal : c.paper}`, borderRadius: 10, overflow: "hidden" }}>
          {!captured && <div style={{ position: "absolute", top: `${scanY}%`, width: "100%", height: 3, background: c.teal, boxShadow: `0 -12px 16px ${c.teal}55` }} />}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 110, background: c.paper, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 500, color: c.teal }}>
          {captured ? "✓  Dokument erfasst" : <div style={{ width: 64, height: 64, borderRadius: "50%", border: `4px solid ${c.teal}`, padding: 5, boxSizing: "border-box" }}><div style={{ width: "100%", height: "100%", background: c.teal, borderRadius: "50%" }} /></div>}
        </div>
        <AbsoluteFill style={{ background: c.paper, pointerEvents: "none", opacity: interpolate(f, [capture - 1, capture, capture + 7], [0, .9, 0], clamp) }} />
      </div>
    </div>
  </Frame>;
}

function Question({ wide, duration }: StageProps) {
  const f = useCurrentFrame();
  const question = "Was muss Lena zum Ausflug mitgeben?";
  const typed = question.slice(0, Math.floor(linear(f, 16, duration - 37, 0, question.length)));
  const thinking = f >= duration - 34;
  return <Frame wide={wide}>
    <div style={{ position: "absolute", width: wide ? 1050 : 1080, height: wide ? 1050 : 1080, borderRadius: "50%", background: c.sage, right: wide ? -210 : -350, top: wide ? -180 : 750 }} />
    <div style={{ position: "absolute", left: 100, top: wide ? 250 : 370, width: wide ? 1050 : 880 }}>
      <Title wide={wide}>Nicht suchen.<br /><span style={{ color: c.teal }}>Einfach fragen.</span></Title>
    </div>
    <div style={{ position: "absolute", left: 100, top: wide ? 570 : 780, width: wide ? 1030 : 880, height: wide ? 260 : 310, background: c.paper, border: `2px solid ${c.line}`, borderRadius: 20, padding: wide ? 42 : 40, boxSizing: "border-box", transform: `translateY(${move(f, 5, 20, 45, 0)}px)`, opacity: move(f, 5, 18, 0, 1) }}>
      <div style={{ color: c.muted, fontSize: 30, marginBottom: 25 }}>Deine Frage an Ordilo</div>
      <div style={{ fontSize: wide ? 53 : 56, lineHeight: 1.14, letterSpacing: "-0.03em", fontWeight: 500 }}>
        {typed}<span style={{ color: c.teal, opacity: thinking || f % 24 < 14 ? 0 : 1 }}>|</span>
      </div>
    </div>
    <div style={{ position: "absolute", left: wide ? 1280 : 310, top: wide ? 350 : 1120, width: wide ? 420 : 460, textAlign: "center", transform: `translateY(${move(f, 8, 28, 80, 0)}px)` }}>
      <Elephant size={wide ? 380 : 360} thinking={thinking} />
      <div style={{ marginTop: -5, color: c.teal, fontSize: 32, opacity: thinking ? move(f, duration - 34, duration - 27, 0, 1) : 0 }}>Ordilo liest die Fundstelle.</div>
    </div>
  </Frame>;
}

function Answer({ wide }: StageProps) {
  const f = useCurrentFrame();
  const enter = settle(f, 8);
  return <Frame wide={wide}>
    <div style={{ position: "absolute", left: 100, top: wide ? 230 : 370, width: wide ? 840 : 880 }}>
      <div style={{ fontSize: 34, color: c.muted, marginBottom: 36 }}>Deine Antwort. Mit Fundstelle.</div>
      <Title wide={wide} style={{ color: c.teal, fontSize: wide ? 116 : 108, transform: `translateY(${(1 - enter) * 65}px)`, opacity: enter }}>Trinkflasche<br />und Regenjacke.</Title>
      <p style={{ margin: "36px 0 0", fontSize: wide ? 38 : 36, lineHeight: 1.4, maxWidth: wide ? 760 : 850 }}>
        Im Kita-Brief steht:<br />Bitte gebt euren Kindern Trinkflasche und Regenjacke mit.
      </p>
    </div>
    <div style={{ position: "absolute", left: wide ? 1080 : 100, top: wide ? 290 : 1040, width: wide ? 740 : 880, padding: wide ? 46 : 42, boxSizing: "border-box", background: c.sand, border: `1px solid ${c.line}`, borderRadius: 20, transform: `translateY(${move(f, 15, 35, 80, 0)}px) rotate(${move(f, 15, 35, 3, 0)}deg)`, opacity: move(f, 15, 30, 0, 1) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28, color: c.muted }}><span>Kita · Mitteilung</span><span>Ausflug am Freitag</span></div>
      <div style={{ fontSize: 84, color: c.teal, height: 90, marginTop: 25 }}>“</div>
      <div style={{ fontSize: wide ? 43 : 44, lineHeight: 1.42, letterSpacing: "-0.02em" }}>Bitte gebt euren Kindern <span style={{ background: `linear-gradient(90deg, ${c.peach} ${move(f, 30, 48, 0, 100)}%, transparent 0%)`, boxDecorationBreak: "clone", padding: "0 5px" }}>Trinkflasche und Regenjacke</span> mit.</div>
      <div style={{ height: 1, background: c.line, margin: "32px 0 25px" }} />
      <div style={{ color: c.teal, fontSize: 30 }}>Die passende Stelle. Direkt dabei. ↗</div>
    </div>
  </Frame>;
}

function Bike() {
  return <svg width="140" height="95" viewBox="0 0 140 95" fill="none" aria-hidden="true"><g stroke={c.teal} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><circle cx="30" cy="64" r="23" /><circle cx="110" cy="64" r="23" /><path d="m30 64 27-42 25 42H30l17-31h48l15 31M91 17h12M95 33l-5-20M49 21h17" /></g></svg>;
}

function Library({ wide, duration }: StageProps) {
  const f = useCurrentFrame();
  const reminder = move(f, duration * .51, duration * .51 + 20, 0, 1);
  const items = [
    { title: "Dokumente", label: "Kita-Brief: Ausflug", detail: "Zettel & Fundstelle", color: c.sand, icon: "paper" },
    { title: "Fahrradnummer", label: "Rahmen-Nr. DEMO-2048", detail: "Zur Hand, wenn du sie brauchst.", color: c.sage, icon: "bike" },
    { title: "Zugangsdaten", label: "Familienportal", detail: "•••• •••• ••••", color: c.warm, icon: "key" },
  ];
  return <Frame wide={wide}>
    <div style={{ position: "absolute", left: 100, top: wide ? 185 : 330, width: wide ? 1700 : 880 }}>
      <Title wide={wide} style={{ fontSize: wide ? 96 : 100 }}>Mehr als Papier.<br /><span style={{ color: c.teal }}>Alles, was ihr braucht.</span></Title>
    </div>
    <div style={{ position: "absolute", left: 100, right: 100, top: wide ? 445 : 650, display: "flex", flexDirection: wide ? "row" : "column", gap: wide ? 24 : 18 }}>
      {items.map((item, i) => {
        const progress = settle(f, 8 + i * 9);
        return <div key={item.title} style={{ flex: wide ? 1 : undefined, height: wide ? 325 : 198, padding: wide ? 32 : 26, boxSizing: "border-box", borderRadius: 20, background: item.color, border: `1px solid ${c.line}`, opacity: progress, transform: `translate(${(1 - progress) * (wide ? 100 : 200)}px, ${(1 - progress) * 35}px) rotate(${(1 - progress) * 8}deg)`, display: "flex", flexDirection: wide ? "column" : "row", gap: wide ? 12 : 28, alignItems: wide ? "flex-start" : "center" }}>
          <div style={{ width: wide ? 140 : 130, height: wide ? 95 : 110, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {item.icon === "bike" ? <Bike /> : item.icon === "paper" ? <svg width="76" height="95" viewBox="0 0 76 95" fill="none"><path d="M10 5h40l17 18v66H10Z" fill={c.paper} stroke={c.teal} strokeWidth="3" /><path d="M49 5v20h18M24 43h28M24 55h28M24 67h17" stroke={c.teal} strokeWidth="3" /></svg> : <svg width="112" height="82" viewBox="0 0 112 82" fill="none"><circle cx="32" cy="38" r="23" stroke={c.teal} strokeWidth="5" /><path d="M55 38h47m-15 0v19m14-19v13" stroke={c.teal} strokeWidth="5" strokeLinecap="round" /><circle cx="25" cy="36" r="5" fill={c.teal} /></svg>}
          </div>
          <div>
            <div style={{ fontSize: 33, fontWeight: 600, color: c.teal, marginBottom: 10 }}>{item.title}</div>
            <div style={{ fontSize: wide ? 30 : 34, fontWeight: 500, lineHeight: 1.2 }}>{item.label}</div>
            <div style={{ fontSize: wide ? 27 : 30, color: c.muted, marginTop: 12 }}>{item.detail}</div>
          </div>
        </div>;
      })}
    </div>
    <div style={{ position: "absolute", left: 100, right: 100, top: wide ? 815 : 1330, minHeight: wide ? 160 : 250, boxSizing: "border-box", display: "flex", flexDirection: wide ? "row" : "column", justifyContent: "space-between", alignItems: wide ? "center" : "flex-start", gap: 20, padding: "28px 34px", borderRadius: 20, border: `1px solid ${c.line}`, background: c.paper, opacity: reminder, transform: `translateY(${(1 - reminder) * 80}px)` }}>
      <div><div style={{ fontSize: wide ? 36 : 38, fontWeight: 500 }}>Freitag früh an den Ausflug denken?</div><div style={{ marginTop: 8, fontSize: 30, color: c.muted }}>Du entscheidest, ob Ordilo dich erinnert.</div></div>
      <div style={{ fontSize: 31, background: c.teal, color: c.paper, padding: "18px 28px", borderRadius: 12, whiteSpace: "nowrap" }}>Erinnerung anlegen +</div>
    </div>
  </Frame>;
}

function Ending({ wide }: StageProps) {
  const f = useCurrentFrame();
  return <Frame wide={wide}>
    <AbsoluteFill style={{ background: c.sage }} />
    <div style={{ position: "absolute", width: wide ? 1050 : 1150, height: wide ? 1050 : 1150, background: c.paper, borderRadius: "50%", right: wide ? -180 : -260, top: wide ? 60 : 880, transform: `scale(${move(f, 0, 35, .82, 1)})` }} />
    <div style={{ position: "absolute", left: 100, top: wide ? 260 : 375, width: wide ? 1080 : 880, transform: `translateY(${move(f, 5, 25, 60, 0)}px)`, opacity: move(f, 5, 20, 0, 1) }}>
      <Title wide={wide} style={{ fontSize: wide ? 120 : 116 }}>Weniger suchen.<br />Mehr Familie.</Title>
      <div style={{ fontSize: wide ? 39 : 40, lineHeight: 1.4, marginTop: 36, color: c.muted, maxWidth: wide ? 900 : 850 }}>Zettel, Antworten und Erinnerungen.<br />Für die ganze Familie. An einem Ort.</div>
      <div style={{ display: "inline-flex", marginTop: 55, borderRadius: 20, padding: "24px 36px", fontSize: 38, color: c.paper, background: c.teal, alignItems: "center", gap: 34 }}>{wide ? "Ordilo ausprobieren" : "Jetzt auf ordilo.de"} <span>↗</span></div>
    </div>
    <div style={{ position: "absolute", left: wide ? 1230 : 320, top: wide ? 285 : 1130, transform: `translateY(${move(f, 12, 35, 100, 0)}px) rotate(${move(f, 12, 35, -8, 0)}deg)`, opacity: move(f, 12, 26, 0, 1) }}><Elephant size={wide ? 470 : 350} /></div>
    <div style={{ position: "absolute", left: wide ? 1330 : 340, top: wide ? 785 : 1500 }}><Brand large /></div>
  </Frame>;
}

function Campaign({ wide }: { wide: boolean }) {
  const intervals = sceneIntervals(wide);
  const scenes = [Hook, Scan, Question, Answer, Library, Ending];
  return <AbsoluteFill style={{ background: c.paper, fontFamily }}>
    {scenes.map((Scene, i) => {
      const { from, duration, mountedDuration } = intervals[i];
      return <Sequence key={i} from={from} durationInFrames={mountedDuration} premountFor={30} name={["Family chaos", "Physical scan", "Ask Ordilo", "Answer with evidence", "Family library", "Discover Ordilo"][i]}>
        <Scene wide={wide} duration={duration} />
      </Sequence>;
    })}
  </AbsoluteFill>;
}

export const SocialCampaign = () => <Campaign wide={false} />;
export const HomepageCampaign = () => <Campaign wide />;
