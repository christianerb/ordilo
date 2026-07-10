import { cn } from "@/lib/utils";

/**
 * A mood for the Ordilo mascot — a small, friendly elephant that stands in
 * for the "AI-native" side of the product without ever feeling clinical.
 *
 * - idle: resting state, gentle breathing + occasional blink
 * - thinking: subtle head nod (used while the AI is processing)
 * - searching: trunk swings side to side, as if looking around
 * - greeting: trunk raised in a wave, happy eyes — plays once on mount
 * - success: same happy pose as greeting, with a small hop — plays once
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

// Paths live in a 68x68 box; the elephant's face is centered around
// (32, 27) with the trunk attaching at (30, 40).
const TRUNK_DOWN =
  "M30 40 C 28.5 44.5 27 48 30 51 C 32 53 35.5 52 34.5 49.5 C 34 48.2 32.3 48.6 32.6 50";
const TRUNK_UP =
  "M30 40 C 34 48 48 48 54 44 C 60 40 58 32 62 24 C 64 20 60 16 56 18";

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
      ? "ordilo-mascot-bounce"
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
        <g className={earAnimClass} style={{ transformOrigin: "13px 20px" }}>
          <path
            d="M21 24 C 15 22 12 27 14 33 C 15.5 37 20 38 22.5 35.5"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g className={earAnimClass} style={{ transformOrigin: "35px 20px" }}>
          <path
            d="M43 24 C 49 22 52 27 50 33 C 48.5 37 44 38 41.5 35.5"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <path
          d="M32 14 C 23.5 14 18 19.5 18 27 C 18 33 21.5 37.5 26 39.5 C 28 40.4 30 40.8 32 40.8 C 34 40.8 36 40.4 38 39.5 C 42.5 37.5 46 33 46 27 C 46 19.5 40.5 14 32 14 Z"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <g
          className={eyeAnimClass}
          style={{ transformOrigin: "center", transformBox: "fill-box" }}
        >
          {eyesClosed ? (
            <>
              <path
                d="M24.5 27 q2 2 4 0"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M35.5 27 q2 2 4 0"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
              />
            </>
          ) : (
            <>
              <circle cx={26.5} cy={27} r={1.6} fill="currentColor" />
              <circle cx={37.5} cy={27} r={1.6} fill="currentColor" />
            </>
          )}
        </g>
        {showBlush && <circle cx={32} cy={32.5} r={1.3} fill="var(--apricot)" />}
      </g>
      <g className={trunkAnimClass} style={{ transformOrigin: "30px 40px" }}>
        <path
          d={trunkUp ? TRUNK_UP : TRUNK_DOWN}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
