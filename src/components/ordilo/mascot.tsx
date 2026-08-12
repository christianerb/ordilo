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

const TRUNK_DOWN =
  "M49.5 33 C50 38.7 52.5 43.4 56 45.8 C59.2 48 61.7 45.8 61 42.8 C60.4 40.3 58.4 39.4 56.9 40.8";
const TRUNK_UP =
  "M49.5 33 C50 38.5 52.7 42.7 56.3 42.4 C60.2 42.1 61.5 38.4 61 34.7 C60.6 31.6 61.8 29.2 64.2 29.7";

/**
 * Ordilo as a warm, filled character. The compact hexagon mark owns tiny
 * brand placements; this character owns emotional moments where users should
 * feel noticed, helped, or celebrated.
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
  const eyesClosed = mood === "sleepy";
  const eyesHappy = mood === "greeting" || mood === "success";
  const trunkUp = mood === "greeting" || mood === "success" || mood === "helping";
  const showBlush = mood === "greeting" || mood === "success";

  const bodyAnimClass =
    mood === "success"
      ? "ordilo-mascot-success"
      : animate
        ? "ordilo-mascot-breathe"
        : undefined;
  const headAnimClass = animate && mood === "thinking" ? "ordilo-mascot-nod" : undefined;
  const earAnimClass = animate && (mood === "helping" || mood === "greeting")
    ? "ordilo-mascot-ear-wiggle"
    : undefined;
  const eyeAnimClass = animate && !eyesClosed && !eyesHappy
    ? "ordilo-mascot-blink"
    : undefined;
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
        <path
          data-part="body"
          d="M15 34 C15 23 23 15 35 15 C45.5 15 52 22.5 52 33.5 C52 43 46 50 37 50 H24 C17.5 50 12 46 12 40.5 C12 37.8 13 35.6 15 34 Z"
          fill="currentColor"
          fillOpacity={0.14}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <g className={earAnimClass} style={{ transformOrigin: "24px 31px" }}>
          <path
            data-part="ear"
            d="M29.5 20 C21 17.8 15.5 23.7 15.5 32.2 C15.5 40.3 20.5 45.5 27.2 44 C33.1 42.7 36.2 37.6 35.4 31.1 C34.8 26.2 33 22.1 29.5 20 Z"
            fill="currentColor"
            fillOpacity={0.28}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <path
            d="M27.8 24 C22.8 23.2 19.8 27 19.8 32.2 C19.8 37 22.5 40.2 26.5 40"
            stroke="currentColor"
            strokeWidth={1.35}
            strokeLinecap="round"
            opacity={0.42}
          />
        </g>
        <g
          className={eyeAnimClass}
          style={{ transformOrigin: "43px 28px", transformBox: "fill-box" }}
        >
          {eyesClosed ? (
            <path
              data-part="eye"
              d="M40.5 28 q2.5 2.1 5 0"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
          ) : eyesHappy ? (
            <path
              data-part="eye"
              d="M40.5 29 q2.5-2.4 5 0"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <circle data-part="eye" cx={43} cy={28} r={1.8} fill="currentColor" />
          )}
        </g>
        <path
          data-part="tusk"
          d="M49.2 36.3 C51.8 36.6 52.7 38.6 50.5 40.8"
          stroke="var(--apricot)"
          strokeWidth={1.55}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M21 48 V54 M28 50 V55 M38 50 V55 M45 47 V54"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <path
          d="M14 37 C10 35 8.5 37.2 10.2 39"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          opacity={0.7}
        />
        {showBlush && (
          <ellipse
            data-part="blush"
            cx={41.5}
            cy={33.5}
            rx={2.5}
            ry={1.25}
            fill="var(--apricot)"
            opacity={0.68}
          />
        )}
      </g>
      <g className={trunkAnimClass} style={{ transformOrigin: "49.5px 33px" }}>
        <path
          data-part="trunk"
          d={trunkUp ? TRUNK_UP : TRUNK_DOWN}
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
