import { cn } from "@/lib/utils";

interface OrdiloMarkProps {
  size?: number;
  animate?: boolean;
  className?: string;
}

/**
 * Ordilo's compact brand mark. The hexagon is the safe family home, while
 * the elephant looks out from it. Filled shapes keep the animal readable at
 * favicon and navigation sizes where the larger character would lose detail.
 */
export function OrdiloMark({
  size = 32,
  animate = true,
  className,
}: OrdiloMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      fill="none"
      aria-hidden="true"
      className={cn("ordilo-mark", animate && "ordilo-mark--alive", className)}
    >
      <path
        d="M36 4 63.7 20v32L36 68 8.3 52V20L36 4Z"
        fill="var(--surface-box)"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 22 36 7v58L10 50V22Z"
        fill="currentColor"
        opacity="0.08"
      />
      <path
        d="M36 7 62 22v13L36 20V7Z"
        fill="var(--wash-sage)"
        opacity="0.82"
      />
      <path
        d="M36 65V42l14 8v7.3L36 65Z"
        fill="currentColor"
        opacity="0.78"
      />

      <g className="ordilo-mark__elephant">
        <path
          data-part="elephant-silhouette"
          d="M28 19 C38 16 47 21 49 30 C50 34 49 38 52 41 C54 43 57 44 59 42 C61 40 60 36 61 33 C62 30 64 29 66 30 C68 31 68 33 66 34 C66 40 65 46 60 49 C54 52 48 49 45 44 C42 48 37 50 31 49 C23 48 18 42 18 34 C18 25 24 18 28 19 Z"
          fill="var(--surface-box)"
          stroke="var(--petrol-darker)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          data-part="ear"
          d="M28 20 C20 18 14 24 14 33 C14 41 19 46 26 45 C33 44 36 38 35 31 C34 25 32 21 28 20 Z"
          fill="var(--wash-sage)"
          stroke="var(--petrol-darker)"
          strokeWidth="2.25"
          strokeLinejoin="round"
        />
        <path
          d="M26 24 C21 23 18 27 18 33 C18 38 21 41 25 41"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.5"
        />
        <g className="ordilo-mark__eye">
          <circle cx="42" cy="29" r="1.7" fill="var(--petrol-darker)" />
        </g>
        <path
          data-part="tusk"
          d="M49 36 C51.6 36 52.5 37.8 50.4 39.9"
          stroke="var(--apricot)"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="ordilo-mark__tusk"
        />
      </g>
    </svg>
  );
}
