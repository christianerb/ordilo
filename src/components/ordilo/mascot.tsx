import { cn } from "@/lib/utils";

/**
 * A mood for the Ordilo mascot — a small, friendly elephant that stands in
 * for the "AI-native" side of the product without ever feeling clinical.
 *
 * - idle: resting state, gentle breathing + occasional blink
 * - thinking: subtle head nod (used while the AI is processing)
 * - searching: trunk swings side to side, as if looking around
 * - greeting: trunk raised in a wave, happy eyes — plays once on mount
 * - success: same happy pose as greeting, with a brief settle-in — plays once
 * - helping: trunk raised and held, ear perked — ready to assist
 * - sleepy: eyes closed, trunk resting low, no idle animation
 */
export type OrdiloMascotMood =
  | "idle"
  | "thinking"
  | "searching"
  | "greeting"
  | "success"
  | "helping"
  | "sleepy";

export interface OrdiloMascotProps {
  /** Pose and expression. Defaults to "idle". */
  mood?: OrdiloMascotMood;
  /** Rendered width/height in px. Defaults to 40. */
  size?: number;
  /**
   * Whether the idle loop (breathing, blinking, swaying, nodding) plays.
   * Discrete one-shot moods ("greeting", "success") always play their
   * entrance animation once regardless of this flag. Defaults to true.
   */
  animate?: boolean;
  className?: string;
  /** Inherited color; pass `{ color: "var(--petrol)" }` etc. */
  style?: React.CSSProperties;
}

// Paths live in a 68x68 box. The profile deliberately keeps the three
// unmistakable elephant cues visible even at 22–28px: one oversized ear,
// a single eye, and a hooked trunk with a small tusk.
const TRUNK_DOWN =
  "M50 35 C52 41 56 44 59 48 C61.5 51.5 60 56.5 56.5 57 C53.4 57.5 51.2 55.2 52.8 52.8 C53.6 51.7 55.2 52.3 55.1 54";
const TRUNK_UP =
  "M50 35 C52.5 41 58 44 62 40 C65 37 63 32 65 27 C66.5 23 63.5 20 60 22";

/**
 * The Ordilo mascot — a small line-art elephant, drawn in the same stroke
 * weight and style as the app's Lucide icons so it can drop into any spot
 * that currently takes an icon (headers, empty states, conversation
 * avatars). Color is inherited via `currentColor`.
 *
 * @example
 * <OrdiloMascot size={28} mood="idle" style={{ color: "var(--petrol)" }} />
 */
export function OrdiloMascot({
  mood = "idle",
  size = 40,
  animate = true,
  className,
  style,
}: OrdiloMascotProps) {
  const eyesClosed = mood === "sleepy" || mood === "greeting" || mood === "success";
  const trunkUp = mood === "greeting" || mood === "success" || mood === "helping";
  const showBlush = mood === "greeting" || mood === "success";

  const bodyAnimClass =
    mood === "success"
      ? "ordilo-mascot-success"
      : animate
        ? "ordilo-mascot-breathe"
        : undefined;
  const headAnimClass = animate && mood === "thinking" ? "ordilo-mascot-nod" : undefined;
  const earAnimClass = animate && mood === "helping" ? "ordilo-mascot-ear-wiggle" : undefined;
  const eyeAnimClass = animate && !eyesClosed ? "ordilo-mascot-blink" : undefined;
  const trunkAnimClass =
    mood === "greeting"
      ? "ordilo-mascot-greet"
      : animate && mood === "searching"
        ? "ordilo-mascot-sway"
        : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 68 68"
      fill="none"
      role="img"
      aria-hidden="true"
      className={cn(bodyAnimClass, className)}
      style={style}
    >
      <g className={headAnimClass}>
        {/* Large, filled ear: the most recognizable silhouette cue when
            Ordilo appears at navigation-icon size. */}
        <g className={earAnimClass} style={{ transformOrigin: "24px 31px" }}>
          <path
            d="M33 22 C27 16 17 18 15 28 C13 38 19 45 27 43 C33 41 36 35 35 29 C35 26 34 24 33 22 Z"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity={0.13}
          />
          <path
            d="M28.5 23 C23 22 19.5 25.5 19.5 31 C19.5 35.5 22.5 38.5 26.5 38"
            stroke="currentColor"
            strokeWidth={1.35}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.54}
          />
        </g>
        <path
          d="M31 15 C42 12 52 20 53 31 C53.5 36 51.5 40.5 48 43.5 C44.5 46.5 39.5 48 34 48 C30 48 26.5 46.8 23.5 44.5"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <g
          className={eyeAnimClass}
          style={{ transformOrigin: "44px 28px", transformBox: "fill-box" }}
        >
          {eyesClosed ? (
            <path
              d="M41.5 28 q2.5 2.2 5 0"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <circle cx={44} cy={28} r={1.65} fill="currentColor" />
          )}
        </g>
        <path
          d="M49 37 C52.5 37 53.2 39.6 50.5 42"
          stroke="currentColor"
          strokeWidth={1.55}
          strokeLinecap="round"
          fill="none"
          opacity={0.72}
        />
        <path
          d="M22 44 V52 M28 48 V53 M39 48 V53 M46 45 V52"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.9}
        />
        {showBlush && <circle cx={42} cy={33} r={1.3} fill="var(--apricot)" />}
      </g>
      <g className={trunkAnimClass} style={{ transformOrigin: "50px 35px" }}>
        <path
          d={trunkUp ? TRUNK_UP : TRUNK_DOWN}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
