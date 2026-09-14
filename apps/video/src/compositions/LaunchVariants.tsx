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

const c = {
  paper: "#FDFCFA",
  sand: "#F7F5F1",
  sandLight: "#F1EEE8",
  sandWarm: "#EFE8DC",
  ink: "#262421",
  border: "#D3CEC5",
  muted: "#625D54",
  petrol: "#305460",
  deep: "#193232",
  apricot: "#E46018",
  sage: "#DDEBE5",
  blue: "#E5EEF1",
  peach: "#F8E7D4",
};

const shadow = "0 12px 16px rgba(38, 36, 33, 0.06)";

const enter = (frame: number, fps: number, delay = 0, durationInFrames = 26) =>
  spring({
    frame: frame - delay,
    fps,
    durationInFrames,
    config: { damping: 200 },
  });

const fade = (frame: number, duration: number) =>
  interpolate(frame, [0, 10, duration - 12, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

const Shot = ({
  from,
  duration,
  children,
}: {
  from: number;
  duration: number;
  children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - from;
  return (
    <AbsoluteFill style={{ opacity: fade(localFrame, duration), pointerEvents: "none" }}>
      {children}
    </AbsoluteFill>
  );
};

const Mark = ({ size = 56, inverse = false }: { size?: number; inverse?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true">
    <path d="M36 4 63.7 20v32L36 68 8.3 52V20L36 4Z" fill={inverse ? c.paper : c.sand} stroke={inverse ? c.paper : c.petrol} strokeWidth="2.6" strokeLinejoin="round" />
    <path d="M10 22 36 7v58L10 50V22Z" fill={c.petrol} opacity="0.1" />
    <path d="M36 7 62 22v13L36 20V7Z" fill={c.sage} opacity="0.95" />
    <path d="M28 19 C38 16 47 21 49 30 C50 34 49 38 52 41 C54 43 57 44 59 42 C61 40 60 36 61 33 C62 30 64 29 66 30 C68 31 68 33 66 34 C66 40 65 46 60 49 C54 52 48 49 45 44 C42 48 37 50 31 49 C23 48 18 42 18 34 C18 25 24 18 28 19 Z" fill={c.paper} stroke={c.deep} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M28 20 C20 18 14 24 14 33 C14 41 19 46 26 45 C33 44 36 38 35 31 C34 25 32 21 28 20 Z" fill={c.sage} stroke={c.deep} strokeWidth="2.25" strokeLinejoin="round" />
    <circle cx="42" cy="29" r="1.7" fill={c.deep} />
    <path d="M49 36 C51.6 36 52.5 37.8 50.4 39.9" stroke={c.apricot} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const Lockup = ({ inverse = false }: { inverse?: boolean }) => (
  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
    <Mark inverse={inverse} />
    <span style={{ color: inverse ? c.paper : c.deep, fontSize: 38, fontWeight: 600, letterSpacing: -1.4 }}>Ordilo</span>
  </div>
);

const Ambient = ({ dark = false, wide = false }: { dark?: boolean; wide?: boolean }) => (
  <AbsoluteFill style={{ backgroundColor: dark ? c.deep : c.paper, overflow: "hidden" }}>
    <div style={{ position: "absolute", width: wide ? 890 : 620, height: wide ? 890 : 620, left: wide ? -330 : -360, top: wide ? -360 : 620, borderRadius: "50%", backgroundColor: dark ? c.petrol : c.blue, opacity: dark ? 0.8 : 0.8 }} />
    <div style={{ position: "absolute", width: wide ? 640 : 420, height: wide ? 640 : 420, right: wide ? -120 : -190, top: wide ? 470 : 1250, borderRadius: "50%", backgroundColor: dark ? c.sage : c.peach, opacity: dark ? 0.11 : 0.88 }} />
    {!wide && <div style={{ position: "absolute", width: 760, height: 650, top: -380, right: 140, backgroundColor: c.sage, opacity: dark ? 0.09 : 0.58, borderRadius: 28, transform: "rotate(-13deg)" }} />}
  </AbsoluteFill>
);

const Text = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ fontFamily, ...style }}>{children}</div>
);

const Body = ({ children, inverse = false, style }: { children: ReactNode; inverse?: boolean; style?: CSSProperties }) => (
  <Text style={{ color: inverse ? "rgba(253,252,250,0.72)" : c.muted, fontSize: 28, lineHeight: 1.38, ...style }}>{children}</Text>
);

const Paper = ({ emphasis = false, style }: { emphasis?: boolean; style?: CSSProperties }) => (
  <div style={{ width: 510, minHeight: 570, borderRadius: 20, padding: 42, backgroundColor: c.paper, border: `1px solid ${c.border}`, boxShadow: shadow, ...style }}>
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: c.blue }} />
      <div>
        <div style={{ width: 210, height: 18, borderRadius: 9, backgroundColor: c.ink }} />
        <div style={{ width: 122, height: 12, borderRadius: 6, marginTop: 13, backgroundColor: c.border }} />
      </div>
    </div>
    <div style={{ height: 1, margin: "36px 0", backgroundColor: c.border }} />
    {[1, 2, 3].map((row) => <div key={row} style={{ height: 14, width: row === 2 ? "76%" : "100%", marginTop: row === 1 ? 0 : 18, borderRadius: 7, backgroundColor: c.sandLight }} />)}
    <div style={{ marginTop: 54, padding: "16px 20px", display: "inline-block", borderRadius: 12, color: emphasis ? c.paper : c.petrol, backgroundColor: emphasis ? c.apricot : c.sage, fontSize: 23, fontWeight: 600 }}>
      Mobilfunkvertrag
    </div>
  </div>
);

const Avatar = ({ initials, hue = c.sage }: { initials: string; hue?: string }) => (
  <div style={{ width: 58, height: 58, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", backgroundColor: hue, color: c.petrol, fontSize: 22, fontWeight: 600, border: `2px solid ${c.paper}` }}>{initials}</div>
);

const NativePhone = ({
  children,
  active,
  style,
}: {
  children: ReactNode;
  active: "Dokumente" | "Ordilo fragen" | "Plan" | "Scannen";
  style?: CSSProperties;
}) => (
  <div style={{ position: "relative", width: 650, height: 1240, borderRadius: 68, border: "16px solid #161615", backgroundColor: c.paper, overflow: "hidden", boxShadow: "0 16px 16px rgba(38, 36, 33, 0.12)", ...style }}>
    <div style={{ position: "absolute", zIndex: 3, left: 0, right: 0, top: 0, height: 105, backgroundColor: c.paper }}>
      <div style={{ position: "absolute", left: 32, top: 28, color: c.ink, fontSize: 23, fontWeight: 600 }}>9:41</div>
      <div style={{ position: "absolute", left: "50%", top: 16, width: 190, height: 45, transform: "translateX(-50%)", borderRadius: 30, backgroundColor: "#000" }} />
      <div style={{ position: "absolute", right: 30, top: 31, display: "flex", gap: 8, alignItems: "center" }}><div style={{ width: 25, height: 13, borderRadius: 4, border: `2px solid ${c.ink}` }} /><div style={{ width: 5, height: 7, backgroundColor: c.ink, borderRadius: 2 }} /></div>
    </div>
    {children}
    <div style={{ position: "absolute", zIndex: 4, left: 15, right: 15, bottom: 16, height: 145, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderRadius: 36, backgroundColor: "rgba(253,252,250,0.98)", boxShadow: "0 -8px 16px rgba(38, 36, 33, 0.07)" }}>
      {["Start", "Dokumente", "Ordilo fragen", "Plan", "Scannen"].map((item) => {
        const isActive = item === active;
        return (
          <div key={item} style={{ width: item === "Ordilo fragen" ? 120 : 82, color: isActive ? c.deep : c.muted, textAlign: "center", fontSize: 15, fontWeight: isActive ? 600 : 500, lineHeight: 1.12 }}>
            <div style={{ width: item === "Ordilo fragen" ? 54 : 33, height: item === "Ordilo fragen" ? 54 : 33, margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: item === "Ordilo fragen" ? 20 : 12, backgroundColor: isActive ? (item === "Ordilo fragen" ? c.sage : c.blue) : c.sand }}>
              {item === "Ordilo fragen" ? <Mark size={41} /> : <div style={{ width: 15, height: 15, borderRadius: item === "Scannen" ? "50%" : 4, border: `2px solid ${isActive ? c.petrol : c.muted}` }} />}
            </div>
            {item}
          </div>
        );
      })}
    </div>
  </div>
);

export const AppStoreStory = () => (
  <AbsoluteFill style={{ fontFamily }}>
    <Shot from={0} duration={174}><MagicProblem /></Shot>
    <Shot from={150} duration={204}><MagicScan /></Shot>
    <Shot from={330} duration={210}><MagicAnswer /></Shot>
    <Shot from={516} duration={204}><MagicFamily /></Shot>
  </AbsoluteFill>
);

const MagicProblem = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headline = enter(frame, fps, 8, 30);
  const papers = enter(frame, fps, 40, 34);
  return (
    <AbsoluteFill>
      <Ambient />
      <div style={{ position: "absolute", top: 92, left: 84 }}><Lockup /></div>
      <Text style={{ position: "absolute", top: 330, left: 84, right: 80, color: c.ink, fontSize: 100, fontWeight: 600, lineHeight: 0.96, letterSpacing: -4, opacity: headline, transform: `translateY(${interpolate(headline, [0, 1], [44, 0])}px)` }}>Dieser Brief<br />muss nicht<br />bei dir bleiben.</Text>
      <div style={{ position: "absolute", left: 110, top: 840, opacity: papers, transform: `translateY(${interpolate(papers, [0, 1], [80, 0])}px)` }}>
        <Paper style={{ transform: "rotate(-8deg)", backgroundColor: c.sandWarm }} />
        <Paper style={{ position: "absolute", top: -12, left: 70, transform: "rotate(5deg)", backgroundColor: c.sand }} />
        <Paper emphasis style={{ position: "absolute", top: -40, left: 30 }} />
      </div>
      <Body style={{ position: "absolute", left: 84, bottom: 130, right: 140 }}>Ein Foto, und aus Papier wird Gewissheit.</Body>
    </AbsoluteFill>
  );
};

const MagicScan = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phone = enter(frame, fps, 7, 30);
  const fact = enter(frame, fps, 74, 30);
  const lineY = interpolate(frame, [52, 126], [250, 715], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  return (
    <AbsoluteFill>
      <Ambient dark />
      <div style={{ position: "absolute", top: 92, left: 84 }}><Lockup inverse /></div>
      <Text style={{ position: "absolute", top: 260, left: 84, right: 80, color: c.paper, fontSize: 77, fontWeight: 600, lineHeight: 1, letterSpacing: -3.1 }}>Ordilo liest,<br />was wichtig ist.</Text>
      <NativePhone active="Scannen" style={{ position: "absolute", top: 525, left: 58, opacity: phone, transform: `translateY(${interpolate(phone, [0, 1], [110, 0])}px)` }}>
        <div style={{ position: "absolute", top: 126, left: 38, right: 38, color: c.ink, fontSize: 38, fontWeight: 600 }}>Dokument scannen</div>
        <div style={{ position: "absolute", top: 205, left: 28, right: 28, height: 690, padding: 30, borderRadius: 22, overflow: "hidden", backgroundColor: c.deep }}>
          <Paper emphasis style={{ position: "absolute", top: 74, left: 66, transform: "rotate(-2deg) scale(0.9)", transformOrigin: "top left" }} />
          <div style={{ position: "absolute", left: 34, right: 34, top: lineY - 215, height: 5, backgroundColor: c.apricot, boxShadow: `0 0 16px ${c.apricot}` }} />
          <div style={{ position: "absolute", left: 30, right: 30, bottom: 28, height: 92, border: `2px solid ${c.sage}`, borderRadius: 20 }} />
        </div>
        <div style={{ position: "absolute", left: 38, right: 38, top: 935, color: c.muted, fontSize: 21, textAlign: "center" }}>Halte den Brief in den Rahmen</div>
      </NativePhone>
      <div style={{ position: "absolute", top: 1040, right: 66, width: 490, padding: 30, borderRadius: 20, backgroundColor: c.paper, opacity: fact, transform: `translateX(${interpolate(fact, [0, 1], [90, 0])}px)` }}>
        <Text style={{ color: c.muted, fontSize: 22 }}>Die nächste Frist</Text>
        <Text style={{ color: c.apricot, fontSize: 45, fontWeight: 600, lineHeight: 1.05, marginTop: 10 }}>30. September</Text>
        <Body style={{ fontSize: 22, marginTop: 18 }}>Mobilfunkvertrag von Lea</Body>
      </div>
    </AbsoluteFill>
  );
};

const MagicAnswer = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const question = enter(frame, fps, 8);
  const answer = enter(frame, fps, 54, 32);
  const evidence = enter(frame, fps, 106);
  return (
    <AbsoluteFill>
      <Ambient />
      <NativePhone active="Ordilo fragen" style={{ position: "absolute", top: 282, left: 215, opacity: question, transform: `translateY(${interpolate(question, [0, 1], [68, 0])}px)` }}>
        <div style={{ position: "absolute", top: 125, left: 38, right: 38, display: "flex", alignItems: "center", gap: 14 }}><Mark size={44} /><Text style={{ color: c.ink, fontSize: 37, fontWeight: 600 }}>Ordilo fragen</Text></div>
        <div style={{ position: "absolute", top: 235, left: 34, right: 34, height: 1, backgroundColor: c.border }} />
        <div style={{ position: "absolute", top: 300, left: 38, right: 38, opacity: answer }}>
          <Text style={{ color: c.muted, fontSize: 19, marginBottom: 12 }}>Du fragst</Text>
          <div style={{ marginLeft: 46, padding: "18px 21px", borderRadius: 16, backgroundColor: c.petrol, color: c.paper, fontSize: 22, lineHeight: 1.22, fontWeight: 500 }}>Wann kann ich Leas Vertrag kündigen?</div>
        </div>
        <div style={{ position: "absolute", top: 510, left: 38, right: 38, opacity: answer, transform: `translateY(${interpolate(answer, [0, 1], [42, 0])}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: c.petrol, fontSize: 18, fontWeight: 600, marginBottom: 11 }}><Mark size={26} />Ordilo antwortet</div>
          <div style={{ padding: 24, borderRadius: 16, backgroundColor: c.sand, border: `1px solid ${c.border}` }}>
            <Text style={{ color: c.petrol, fontSize: 31, fontWeight: 600, lineHeight: 1.08 }}>Zum 30. September.</Text>
            <Body style={{ marginTop: 15, fontSize: 20 }}>Ich erinnere euch rechtzeitig.</Body>
          </div>
        </div>
        <div style={{ position: "absolute", left: 38, right: 38, bottom: 205, padding: "17px 19px", borderRadius: 12, backgroundColor: c.sage, opacity: evidence }}>
          <Text style={{ color: c.petrol, fontSize: 17, fontWeight: 600 }}>Gefunden im Mobilfunkvertrag von Lea</Text>
        </div>
      </NativePhone>
      <Text style={{ position: "absolute", top: 142, left: 84, right: 84, color: c.ink, fontSize: 66, lineHeight: 1, letterSpacing: -2.7, fontWeight: 600, opacity: answer }}>Eine Antwort.<br />Mit Fundstelle.</Text>
    </AbsoluteFill>
  );
};

const MagicFamily = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const task = enter(frame, fps, 10, 32);
  const family = enter(frame, fps, 58, 32);
  return (
    <AbsoluteFill>
      <Ambient dark />
      <Text style={{ position: "absolute", top: 130, left: 84, right: 84, color: c.paper, fontSize: 70, lineHeight: 0.98, letterSpacing: -2.8, fontWeight: 600 }}>Dann ist es<br />bei allen.</Text>
      <NativePhone active="Plan" style={{ position: "absolute", top: 360, left: 215, opacity: task, transform: `translateY(${interpolate(task, [0, 1], [75, 0])}px)` }}>
        <div style={{ position: "absolute", top: 124, left: 38, right: 38 }}><Text style={{ color: c.ink, fontSize: 39, fontWeight: 600 }}>Plan</Text><Body style={{ fontSize: 19, marginTop: 4 }}>Heute zusammen im Blick</Body></div>
        <div style={{ position: "absolute", top: 232, left: 30, right: 30, height: 2, backgroundColor: c.border }} />
        <div style={{ position: "absolute", top: 278, left: 30, right: 30, padding: 22, borderRadius: 20, backgroundColor: c.sage }}>
          <Text style={{ color: c.petrol, fontSize: 26, fontWeight: 600 }}>Jetzt dran</Text>
          <div style={{ marginTop: 18, padding: 20, borderRadius: 12, backgroundColor: c.paper }}>
            <div style={{ display: "flex", alignItems: "center", gap: 15 }}><div style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.blue }} /><div style={{ flex: 1 }}><Text style={{ color: c.ink, fontSize: 22, fontWeight: 600 }}>Vertrag kündigen</Text><Body style={{ fontSize: 17, color: c.apricot, marginTop: 5 }}>30 Tage vorher</Body></div><Avatar initials="L" /></div>
          </div>
        </div>
        <div style={{ position: "absolute", top: 618, left: 30, right: 30, padding: 22, borderRadius: 20, backgroundColor: c.sage, opacity: family }}>
          <Text style={{ color: c.petrol, fontSize: 25, fontWeight: 600 }}>Als Nächstes</Text>
          <div style={{ marginTop: 17, padding: 20, borderRadius: 12, backgroundColor: c.paper, display: "flex", alignItems: "center", gap: 15 }}><div style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.blue }} /><div><Text style={{ color: c.ink, fontSize: 21, fontWeight: 600 }}>Kita-Bescheid ablegen</Text><Body style={{ fontSize: 17, marginTop: 4 }}>Morgen · Für euch</Body></div></div>
        </div>
      </NativePhone>
      <div style={{ position: "absolute", left: 84, right: 84, bottom: 75, padding: 28, borderRadius: 20, backgroundColor: c.paper, color: c.deep, fontSize: 29, fontWeight: 600, textAlign: "center" }}>Ordilo kostenlos starten</div>
    </AbsoluteFill>
  );
};

export const FamilyReel = () => (
  <AbsoluteFill style={{ fontFamily }}>
    <Shot from={0} duration={140}><ReelHook /></Shot>
    <Shot from={122} duration={160}><ReelRelief /></Shot>
    <Shot from={264} duration={186}><ReelEnd /></Shot>
  </AbsoluteFill>
);

const ReelHook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = enter(frame, fps, 5, 28);
  const b = enter(frame, fps, 44, 28);
  return (
    <AbsoluteFill>
      <Ambient dark />
      <div style={{ position: "absolute", top: 82, left: 72 }}><Lockup inverse /></div>
      <Text style={{ position: "absolute", top: 300, left: 72, right: 72, color: c.paper, fontSize: 100, fontWeight: 600, letterSpacing: -4.3, lineHeight: 0.93, opacity: a }}>Du bist nicht<br />die Ablage<br />deiner Familie.</Text>
      <div style={{ position: "absolute", bottom: 150, left: 72, right: 72, color: c.sage, fontSize: 34, lineHeight: 1.22, fontWeight: 500, opacity: b }}>Und du musst auch nicht alles im Kopf behalten.</div>
    </AbsoluteFill>
  );
};

const ReelRelief = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const paperIn = enter(frame, fps, 12, 28);
  const markIn = enter(frame, fps, 53, 30);
  const wordsIn = enter(frame, fps, 86, 28);
  return (
    <AbsoluteFill>
      <Ambient />
      <div style={{ position: "absolute", top: 90, left: 72 }}><Lockup /></div>
      <NativePhone active="Dokumente" style={{ position: "absolute", top: 305, left: 220, opacity: paperIn, transform: `rotate(${interpolate(paperIn, [0, 1], [-8, 0])}deg) scale(${interpolate(paperIn, [0, 1], [0.6, 0.66])})`, transformOrigin: "top left" }}>
        <div style={{ position: "absolute", top: 124, left: 38, right: 38 }}><Text style={{ color: c.ink, fontSize: 39, fontWeight: 600 }}>Dokumente</Text><Body style={{ fontSize: 18, marginTop: 4 }}>Alles an einem Ort</Body></div>
        <div style={{ position: "absolute", top: 240, left: 30, right: 30, padding: 18, borderRadius: 12, backgroundColor: c.sand, border: `1px solid ${c.border}` }}><Text style={{ color: c.muted, fontSize: 18 }}>Titel, Inhalt oder Absender</Text></div>
        <div style={{ position: "absolute", top: 330, left: 30, right: 30, padding: 18, borderRadius: 16, backgroundColor: c.sage }}><Text style={{ color: c.petrol, fontSize: 19, fontWeight: 600 }}>Heute</Text><div style={{ marginTop: 12, padding: 18, borderRadius: 12, backgroundColor: c.paper }}><Text style={{ color: c.ink, fontSize: 20, fontWeight: 600 }}>Mobilfunkvertrag</Text><Body style={{ fontSize: 16, marginTop: 5 }}>Lea · Frist erkannt</Body></div></div>
      </NativePhone>
      <Text style={{ position: "absolute", top: 1220, left: 72, right: 72, color: c.ink, fontSize: 58, fontWeight: 600, textAlign: "center", lineHeight: 1.05, letterSpacing: -2.3, opacity: markIn * wordsIn }}>Liest. Erinnert.<br />Hält zusammen.</Text>
    </AbsoluteFill>
  );
};

const ReelEnd = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cards = enter(frame, fps, 12, 28);
  const end = enter(frame, fps, 65, 28);
  return (
    <AbsoluteFill>
      <Ambient />
      <div style={{ position: "absolute", top: 88, left: 72 }}><Lockup /></div>
      <div style={{ position: "absolute", top: 370, left: 72, right: 72, display: "flex", justifyContent: "space-between", opacity: cards, transform: `translateY(${interpolate(cards, [0, 1], [70, 0])}px)` }}>
        <Avatar initials="L" hue={c.sage} /><Avatar initials="M" hue={c.peach} /><Avatar initials="A" hue={c.blue} />
      </div>
      <Text style={{ position: "absolute", top: 560, left: 72, right: 72, color: c.ink, fontSize: 82, lineHeight: 0.96, letterSpacing: -3.4, fontWeight: 600, opacity: cards }}>Weniger<br />Papierkram.</Text>
      <Text style={{ position: "absolute", top: 770, left: 72, right: 72, color: c.petrol, fontSize: 82, lineHeight: 0.96, letterSpacing: -3.4, fontWeight: 600, opacity: end }}>Mehr Kopf frei.</Text>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 180, padding: 29, borderRadius: 20, color: c.paper, backgroundColor: c.petrol, fontSize: 29, fontWeight: 600, textAlign: "center", opacity: end }}>Jetzt kostenlos starten</div>
      <Body style={{ position: "absolute", left: 0, right: 0, bottom: 100, textAlign: "center", fontSize: 22, opacity: end }}>ordilo.de</Body>
    </AbsoluteFill>
  );
};

export const HomepageLoop = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const phase = interpolate(frame, [0, 50, 170, 220, 350], [0, 1, 1, 0, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const answer = enter(frame, fps, 145, 28);
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Ambient wide />
      <div style={{ position: "absolute", top: 78, left: 100 }}><Lockup /></div>
      <Text style={{ position: "absolute", top: 220, left: 100, color: c.ink, fontSize: 72, fontWeight: 600, lineHeight: 0.98, letterSpacing: -3 }}>Scannen.<br />Fragen.<br /><span style={{ color: c.petrol }}>Erledigt.</span></Text>
      <NativePhone active="Ordilo fragen" style={{ position: "absolute", left: 755, top: 115, opacity: phase, transform: `translateY(${interpolate(phase, [0, 1], [80, 0])}px) scale(0.65)`, transformOrigin: "top left" }}>
        <div style={{ position: "absolute", top: 124, left: 38, right: 38, display: "flex", alignItems: "center", gap: 14 }}><Mark size={44} /><Text style={{ color: c.ink, fontSize: 37, fontWeight: 600 }}>Ordilo fragen</Text></div>
        <div style={{ position: "absolute", top: 235, left: 34, right: 34, height: 1, backgroundColor: c.border }} />
        <div style={{ position: "absolute", top: 310, left: 38, right: 38 }}>
          <Text style={{ color: c.muted, fontSize: 19, marginBottom: 12 }}>Du fragst</Text>
          <div style={{ marginLeft: 46, padding: "18px 21px", borderRadius: 16, backgroundColor: c.petrol, color: c.paper, fontSize: 22, lineHeight: 1.22, fontWeight: 500 }}>Wann kann ich Leas Vertrag kündigen?</div>
        </div>
        <div style={{ position: "absolute", top: 510, left: 38, right: 38, opacity: answer }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: c.petrol, fontSize: 18, fontWeight: 600, marginBottom: 11 }}><Mark size={26} />Ordilo antwortet</div>
          <div style={{ padding: 24, borderRadius: 16, backgroundColor: c.sand, border: `1px solid ${c.border}` }}><Text style={{ color: c.petrol, fontSize: 31, fontWeight: 600 }}>Zum 30. September.</Text><Body style={{ marginTop: 15, fontSize: 20 }}>Mit Erinnerung für eure Familie.</Body></div>
        </div>
      </NativePhone>
      <div style={{ position: "absolute", left: 1170, top: 390, width: 560, padding: 32, borderRadius: 20, backgroundColor: c.paper, border: `1px solid ${c.border}`, boxShadow: shadow, opacity: answer, transform: `translateX(${interpolate(answer, [0, 1], [52, 0])}px)` }}>
        <Text style={{ color: c.petrol, fontSize: 29, fontWeight: 600 }}>Aufgabe vorbereitet.</Text>
        <Body style={{ marginTop: 14, fontSize: 22 }}>Aus Leas Vertrag. Für eure Familie sichtbar.</Body>
        <div style={{ height: 1, backgroundColor: c.border, margin: "23px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Text style={{ color: c.ink, fontSize: 19, fontWeight: 600 }}>Kündigung vormerken</Text><Avatar initials="L" /></div>
      </div>
      <Body style={{ position: "absolute", bottom: 86, left: 100, width: 560, fontSize: 25 }}>Die Dokumenten-App, die den Papierkram deiner Familie versteht.</Body>
    </AbsoluteFill>
  );
};
