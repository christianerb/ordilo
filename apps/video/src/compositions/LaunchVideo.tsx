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

const colors = {
  warmWhite: "#FDFCFA",
  sand: "#F7F5F1",
  sandLight: "#F1EEE8",
  sandWarm: "#EFE8DC",
  graphite: "#262421",
  mistLight: "#D3CEC5",
  mistDark: "#625D54",
  petrol: "#305460",
  petrolDarker: "#193232",
  apricot: "#E46018",
  sage: "#DDEBE5",
  blueWash: "#E5EEF1",
  apricotWash: "#F8E7D4",
};

const timings = {
  hero: { start: 0, duration: 210 },
  scan: { start: 210, duration: 240 },
  ask: { start: 450, duration: 240 },
  plan: { start: 690, duration: 210 },
  outro: { start: 900, duration: 210 },
} as const;

export type LaunchVideoProps = {
  tagline: string;
};

export const LaunchVideo = ({ tagline }: LaunchVideoProps) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: colors.warmWhite, fontFamily, overflow: "hidden" }}>
      <Scene {...timings.hero} frame={frame}>
        <HeroScene />
      </Scene>
      <Scene {...timings.scan} frame={frame}>
        <ScanScene />
      </Scene>
      <Scene {...timings.ask} frame={frame}>
        <AskScene />
      </Scene>
      <Scene {...timings.plan} frame={frame}>
        <PlanScene />
      </Scene>
      <Scene {...timings.outro} frame={frame}>
        <OutroScene tagline={tagline} />
      </Scene>
    </AbsoluteFill>
  );
};

const Scene = ({
  frame,
  start,
  duration,
  children,
}: {
  frame: number;
  start: number;
  duration: number;
  children: ReactNode;
}) => {
  const localFrame = frame - start;
  const opacity = interpolate(
    localFrame,
    [0, 12, duration - 16, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) },
  );

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      {children}
    </AbsoluteFill>
  );
};

const useEnter = (delay = 0, durationInFrames = 24) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames,
  });
};

const Background = ({ tone = colors.warmWhite }: { tone?: string }) => (
  <AbsoluteFill style={{ backgroundColor: tone, overflow: "hidden" }}>
    <div style={orbStyle(-190, 130, 470, colors.blueWash)} />
    <div style={orbStyle(810, 1210, 420, colors.apricotWash)} />
    <div
      style={{
        position: "absolute",
        width: 570,
        height: 570,
        left: 360,
        top: -260,
        transform: "rotate(-10deg)",
        borderRadius: 80,
        backgroundColor: colors.sage,
        opacity: 0.58,
      }}
    />
  </AbsoluteFill>
);

const orbStyle = (left: number, top: number, size: number, color: string): CSSProperties => ({
  position: "absolute",
  left,
  top,
  width: size,
  height: size,
  borderRadius: "50%",
  backgroundColor: color,
});

const Wordmark = ({ light = false }: { light?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    <OrdiloMark size={58} light={light} />
    <span style={{ color: light ? colors.warmWhite : colors.petrolDarker, fontSize: 42, fontWeight: 600, letterSpacing: -1.8 }}>
      Ordilo
    </span>
  </div>
);

const OrdiloMark = ({ size, light = false }: { size: number; light?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true">
    <path d="M36 4 63.7 20v32L36 68 8.3 52V20L36 4Z" fill={light ? colors.warmWhite : colors.sand} stroke={light ? colors.warmWhite : colors.petrol} strokeWidth="2.6" strokeLinejoin="round" />
    <path d="M10 22 36 7v58L10 50V22Z" fill={light ? colors.petrol : colors.petrol} opacity="0.1" />
    <path d="M36 7 62 22v13L36 20V7Z" fill={colors.sage} opacity="0.95" />
    <path d="M28 19 C38 16 47 21 49 30 C50 34 49 38 52 41 C54 43 57 44 59 42 C61 40 60 36 61 33 C62 30 64 29 66 30 C68 31 68 33 66 34 C66 40 65 46 60 49 C54 52 48 49 45 44 C42 48 37 50 31 49 C23 48 18 42 18 34 C18 25 24 18 28 19 Z" fill={colors.warmWhite} stroke={colors.petrolDarker} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M28 20 C20 18 14 24 14 33 C14 41 19 46 26 45 C33 44 36 38 35 31 C34 25 32 21 28 20 Z" fill={colors.sage} stroke={colors.petrolDarker} strokeWidth="2.25" strokeLinejoin="round" />
    <circle cx="42" cy="29" r="1.7" fill={colors.petrolDarker} />
    <path d="M49 36 C51.6 36 52.5 37.8 50.4 39.9" stroke={colors.apricot} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const OrdiloCharacter = ({ progress }: { progress: number }) => {
  const bob = interpolate(progress, [0, 1], [18, 0]);
  const ear = interpolate(progress, [0, 1], [-8, 0]);
  return (
    <svg width={250} height={250} viewBox="0 0 68 68" fill="none" aria-hidden="true" style={{ transform: `translateY(${bob}px)` }}>
      <path d="M15 34 C15 23 23 15 35 15 C45.5 15 52 22.5 52 33.5 C52 43 46 50 37 50 H24 C17.5 50 12 46 12 40.5 C12 37.8 13 35.6 15 34 Z" fill={colors.petrol} fillOpacity={0.14} stroke={colors.petrol} strokeWidth={2} strokeLinejoin="round" />
      <g style={{ transform: `rotate(${ear}deg)`, transformOrigin: "24px 31px" }}>
        <path d="M29.5 20 C21 17.8 15.5 23.7 15.5 32.2 C15.5 40.3 20.5 45.5 27.2 44 C33.1 42.7 36.2 37.6 35.4 31.1 C34.8 26.2 33 22.1 29.5 20 Z" fill={colors.sage} stroke={colors.petrol} strokeWidth={2} strokeLinejoin="round" />
      </g>
      <path d="M21 48 V54 M28 50 V55 M38 50 V55 M45 47 V54" stroke={colors.petrol} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx="43" cy="28" r="1.8" fill={colors.petrol} />
      <path d="M49.5 33 C50 38.5 52.7 42.7 56.3 42.4 C60.2 42.1 61.5 38.4 61 34.7 C60.6 31.6 61.8 29.2 64.2 29.7" stroke={colors.petrol} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M49.2 36.3 C51.8 36.6 52.7 38.6 50.5 40.8" stroke={colors.apricot} strokeWidth={1.55} strokeLinecap="round" />
    </svg>
  );
};

const HeroScene = () => {
  const title = useEnter(8, 32);
  const card = useEnter(32, 32);
  const mascot = useEnter(54, 34);
  return (
    <AbsoluteFill>
      <Background />
      <div style={{ position: "absolute", left: 88, top: 92 }}>
        <Wordmark />
      </div>
      <div style={{ position: "absolute", left: 88, top: 350, right: 88 }}>
        <div style={{ opacity: title, transform: `translateY(${interpolate(title, [0, 1], [34, 0])}px)` }}>
          <p style={eyebrow}>Für Familien, die genug im Kopf haben</p>
          <h1 style={headline}>Nicht noch<br />ein Zettel.</h1>
        </div>
        <div style={{ marginTop: 50, opacity: card, transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)` }}>
          <PaperStack />
        </div>
      </div>
      <div style={{ position: "absolute", right: 80, bottom: 150, opacity: mascot }}>
        <OrdiloCharacter progress={mascot} />
      </div>
      <p style={{ ...body, position: "absolute", left: 88, bottom: 148, width: 500, color: colors.mistDark }}>
        Briefe, Rechnungen und Fristen. Ordilo bringt Ruhe rein.
      </p>
    </AbsoluteFill>
  );
};

const PaperStack = () => (
  <div style={{ position: "relative", height: 460 }}>
    <div style={{ ...paper, transform: "rotate(-5deg)", top: 34, left: 52, backgroundColor: colors.sandWarm }} />
    <div style={{ ...paper, transform: "rotate(4deg)", top: 18, left: 10, backgroundColor: colors.sand }} />
    <div style={{ ...paper, top: 0, left: 30, backgroundColor: colors.warmWhite }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.blueWash }} />
        <div>
          <div style={{ width: 270, height: 18, borderRadius: 9, backgroundColor: colors.graphite }} />
          <div style={{ width: 175, height: 14, borderRadius: 8, marginTop: 14, backgroundColor: colors.mistLight }} />
        </div>
      </div>
      <div style={{ height: 1, backgroundColor: colors.mistLight, margin: "36px 0" }} />
      <div style={{ width: "100%", height: 16, borderRadius: 8, backgroundColor: colors.sandLight }} />
      <div style={{ width: "77%", height: 16, borderRadius: 8, marginTop: 16, backgroundColor: colors.sandLight }} />
      <div style={{ width: "88%", height: 16, borderRadius: 8, marginTop: 16, backgroundColor: colors.sandLight }} />
      <div style={{ marginTop: 42, display: "inline-flex", padding: "12px 18px", borderRadius: 999, backgroundColor: colors.sage, color: colors.petrol, fontWeight: 600, fontSize: 22 }}>
        Wichtig
      </div>
    </div>
  </div>
);

const paper: CSSProperties = {
  position: "absolute",
  width: 640,
  height: 370,
  padding: 42,
  borderRadius: 28,
  boxShadow: "0 18px 35px rgba(38, 36, 33, 0.08)",
  border: `1px solid ${colors.mistLight}`,
};

const ScanScene = () => {
  const phone = useEnter(7, 32);
  const card = useEnter(28, 32);
  const frame = useCurrentFrame();
  const scanLine = interpolate(frame, [45, 150], [175, 545], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const extracted = useEnter(132, 26);
  return (
    <AbsoluteFill>
      <Background tone={colors.sand} />
      <div style={{ position: "absolute", left: 88, top: 104 }}>
        <Wordmark />
      </div>
      <div style={{ position: "absolute", top: 270, left: 88, right: 88 }}>
        <p style={eyebrow}>Ein Foto genügt</p>
        <h2 style={{ ...headline, fontSize: 80, marginTop: 16 }}>Scannen.<br />Ordilo versteht.</h2>
      </div>
      <PhoneFrame style={{ position: "absolute", left: 88, bottom: 86, opacity: phone, transform: `translateY(${interpolate(phone, [0, 1], [80, 0])}px)` }}>
        <div style={{ height: "100%", padding: 34, backgroundColor: colors.petrolDarker }}>
          <div style={{ color: colors.warmWhite, fontSize: 26, fontWeight: 600 }}>Dokument scannen</div>
          <div style={{ position: "absolute", left: 42, top: 150, width: 466, height: 420, borderRadius: 26, backgroundColor: colors.warmWhite, transform: "rotate(-2deg)", padding: 36 }}>
            <div style={{ width: 150, height: 14, borderRadius: 8, backgroundColor: colors.mistLight }} />
            <div style={{ width: 300, height: 20, borderRadius: 10, marginTop: 25, backgroundColor: colors.graphite }} />
            <div style={{ width: 340, height: 12, borderRadius: 6, marginTop: 35, backgroundColor: colors.sandLight }} />
            <div style={{ width: 280, height: 12, borderRadius: 6, marginTop: 15, backgroundColor: colors.sandLight }} />
            <div style={{ width: 326, height: 12, borderRadius: 6, marginTop: 15, backgroundColor: colors.sandLight }} />
            <div style={{ width: 220, height: 38, borderRadius: 12, marginTop: 44, backgroundColor: colors.apricotWash }} />
          </div>
          <div style={{ position: "absolute", zIndex: 2, top: scanLine, left: 42, width: 466, height: 5, backgroundColor: colors.apricot, boxShadow: `0 0 18px ${colors.apricot}` }} />
          <div style={{ position: "absolute", bottom: 42, left: 36, right: 36, height: 88, borderRadius: 22, border: `2px solid ${colors.sage}`, opacity: 0.9 }} />
        </div>
      </PhoneFrame>
      <div style={{ position: "absolute", right: 66, bottom: 148, width: 480, opacity: card, transform: `translateY(${interpolate(card, [0, 1], [36, 0])}px)` }}>
        <div style={{ ...cardStyle, backgroundColor: colors.warmWhite }}>
          <p style={{ ...eyebrow, marginBottom: 18 }}>Ordilo hat gefunden</p>
          <InfoRow label="Vertrag" value="Mobilfunkvertrag" />
          <InfoRow label="Frist" value="30. September" highlight />
          <InfoRow label="Für" value="Lea" />
        </div>
        <div style={{ marginTop: 24, opacity: extracted, padding: 24, borderRadius: 22, backgroundColor: colors.petrol, color: colors.warmWhite, fontSize: 26, fontWeight: 600 }}>
          Alles ist sauber abgelegt.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PhoneFrame = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ width: 550, height: 780, border: "15px solid #262421", borderRadius: 62, overflow: "hidden", boxShadow: "0 24px 44px rgba(38, 36, 33, 0.18)", ...style }}>
    {children}
  </div>
);

const InfoRow = ({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) => (
  <div style={{ padding: "19px 0", borderTop: `1px solid ${colors.mistLight}` }}>
    <div style={{ color: colors.mistDark, fontSize: 21 }}>{label}</div>
    <div style={{ color: highlight ? colors.apricot : colors.graphite, fontSize: 29, marginTop: 5, fontWeight: 600 }}>{value}</div>
  </div>
);

const AskScene = () => {
  const title = useEnter(8, 26);
  const question = useEnter(34, 26);
  const answer = useEnter(87, 30);
  const source = useEnter(130, 26);
  const frame = useCurrentFrame();
  const fullQuestion = "Wann kann ich Leas Vertrag kündigen?";
  const count = Math.floor(interpolate(frame, [45, 106], [0, fullQuestion.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <AbsoluteFill>
      <Background />
      <div style={{ position: "absolute", left: 88, top: 104 }}>
        <Wordmark />
      </div>
      <div style={{ position: "absolute", top: 285, left: 88, right: 88, opacity: title }}>
        <p style={eyebrow}>Nicht suchen</p>
        <h2 style={{ ...headline, fontSize: 80, marginTop: 16 }}>Einfach fragen.</h2>
      </div>
      <div style={{ ...phoneChatStyle, opacity: question, transform: `translateY(${interpolate(question, [0, 1], [48, 0])}px)` }}>
        <div style={{ color: colors.mistDark, fontSize: 22, marginBottom: 12 }}>Du fragst</div>
        <div style={{ padding: 26, borderRadius: "24px 24px 6px 24px", backgroundColor: colors.petrol, color: colors.warmWhite, fontSize: 29, lineHeight: 1.32, fontWeight: 500 }}>
          {fullQuestion.slice(0, count)}
          <span style={{ opacity: count < fullQuestion.length ? 1 : 0 }}>|</span>
        </div>
      </div>
      <div style={{ ...phoneChatStyle, top: 860, opacity: answer, transform: `translateY(${interpolate(answer, [0, 1], [54, 0])}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: colors.petrol, fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
          <OrdiloMark size={31} />
          Ordilo antwortet
        </div>
        <div style={{ padding: 30, borderRadius: "24px 24px 24px 6px", backgroundColor: colors.sand, border: `1px solid ${colors.mistLight}` }}>
          <div style={{ color: colors.petrol, fontSize: 41, fontWeight: 600, lineHeight: 1.15 }}>
            Zum 30. September.
          </div>
          <p style={{ ...body, marginTop: 20, fontSize: 25 }}>
            Dein Vertrag läuft noch. Ich erinnere dich rechtzeitig.
          </p>
        </div>
      </div>
      <div style={{ position: "absolute", left: 112, right: 112, bottom: 118, opacity: source, padding: "22px 28px", borderRadius: 22, backgroundColor: colors.sage, color: colors.petrolDarker, fontSize: 23, fontWeight: 500 }}>
        Gefunden im Mobilfunkvertrag von Lea
      </div>
    </AbsoluteFill>
  );
};

const phoneChatStyle: CSSProperties = {
  position: "absolute",
  top: 560,
  left: 88,
  right: 88,
};

const PlanScene = () => {
  const title = useEnter(8, 26);
  const first = useEnter(30, 28);
  const second = useEnter(52, 28);
  const third = useEnter(74, 28);
  return (
    <AbsoluteFill>
      <Background tone={colors.sand} />
      <div style={{ position: "absolute", left: 88, top: 104 }}>
        <Wordmark />
      </div>
      <div style={{ position: "absolute", top: 290, left: 88, right: 88, opacity: title }}>
        <p style={eyebrow}>Für alle da</p>
        <h2 style={{ ...headline, fontSize: 78, marginTop: 16 }}>Nichts Wichtiges<br />geht verloren.</h2>
      </div>
      <div style={{ position: "absolute", left: 88, right: 88, top: 730 }}>
        <TaskCard title="Vertrag rechtzeitig kündigen" due="30 Tage vorher" initials="L" progress={first} priority />
        <TaskCard title="Zahnarzttermin eintragen" due="Morgen" initials="M" progress={second} />
        <TaskCard title="Kita-Bescheid ablegen" due="Heute" initials="A" progress={third} />
      </div>
      <div style={{ position: "absolute", bottom: 104, left: 88, right: 88, padding: 30, borderRadius: 26, backgroundColor: colors.petrolDarker, color: colors.warmWhite, fontSize: 29, lineHeight: 1.25 }}>
        Einer scannt. Alle wissen Bescheid.
      </div>
    </AbsoluteFill>
  );
};

const TaskCard = ({ title, due, initials, progress, priority = false }: { title: string; due: string; initials: string; progress: number; priority?: boolean }) => (
  <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 22, marginBottom: 20, opacity: progress, transform: `translateX(${interpolate(progress, [0, 1], [52, 0])}px)` }}>
    <div style={{ width: 44, height: 44, borderRadius: "50%", border: `3px solid ${colors.petrol}`, flexShrink: 0 }} />
    <div style={{ flex: 1 }}>
      <div style={{ color: colors.graphite, fontSize: 27, fontWeight: 600 }}>{title}</div>
      <div style={{ color: priority ? colors.apricot : colors.mistDark, fontSize: 21, marginTop: 8, fontWeight: 500 }}>{due}</div>
    </div>
    <div style={{ width: 54, height: 54, borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: colors.sage, color: colors.petrol, fontSize: 22, fontWeight: 600 }}>{initials}</div>
  </div>
);

const OutroScene = ({ tagline }: LaunchVideoProps) => {
  const mark = useEnter(10, 34);
  const copy = useEnter(38, 30);
  const cta = useEnter(72, 26);
  return (
    <AbsoluteFill style={{ backgroundColor: colors.petrolDarker }}>
      <div style={{ ...orbStyle(-190, 180, 570, colors.petrol), opacity: 0.8 }} />
      <div style={{ ...orbStyle(720, 1220, 470, colors.sage), opacity: 0.12 }} />
      <div style={{ position: "absolute", top: 420, left: 0, right: 0, alignItems: "center", display: "flex", flexDirection: "column" }}>
        <div style={{ opacity: mark, transform: `scale(${interpolate(mark, [0, 1], [0.7, 1])})` }}>
          <OrdiloMark size={132} light />
        </div>
        <div style={{ marginTop: 40, opacity: copy, transform: `translateY(${interpolate(copy, [0, 1], [32, 0])}px)` }}>
          <Wordmark light />
        </div>
        <h2 style={{ margin: "78px 72px 0", color: colors.warmWhite, fontSize: 75, lineHeight: 1.06, letterSpacing: -3, fontWeight: 600, textAlign: "center", opacity: copy }}>
          {tagline}
        </h2>
        <div style={{ marginTop: 72, opacity: cta, padding: "20px 34px", borderRadius: 999, backgroundColor: colors.warmWhite, color: colors.petrolDarker, fontSize: 26, fontWeight: 600 }}>
          Ordilo kostenlos starten
        </div>
      </div>
      <p style={{ position: "absolute", bottom: 110, left: 0, right: 0, color: "rgba(255,255,255,0.64)", fontSize: 24, textAlign: "center" }}>
        ordilo.de
      </p>
    </AbsoluteFill>
  );
};

const headline: CSSProperties = {
  color: colors.graphite,
  fontSize: 102,
  fontWeight: 600,
  letterSpacing: -4.5,
  lineHeight: 0.97,
  margin: 0,
};

const eyebrow: CSSProperties = {
  color: colors.petrol,
  fontSize: 24,
  fontWeight: 600,
  letterSpacing: 0,
  margin: 0,
};

const body: CSSProperties = {
  color: colors.graphite,
  fontSize: 29,
  lineHeight: 1.42,
  margin: 0,
};

const cardStyle: CSSProperties = {
  padding: 30,
  borderRadius: 24,
  backgroundColor: colors.warmWhite,
  border: `1px solid ${colors.mistLight}`,
  boxShadow: "0 8px 22px rgba(38, 36, 33, 0.06)",
};
