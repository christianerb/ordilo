import { cn } from "@/lib/utils";

interface OrdiloMarkProps {
  size?: number;
  animate?: boolean;
  className?: string;
}

/**
 * Geometry of the app icon (scripts/render-app-icons.mjs, 1024-unit
 * canvas), shared with the native mark in
 * apps/mobile/src/components/ordilo-mark.tsx. Keep all three in sync.
 */
const HEXAGON = "M512 118 L853 315 L853 709 L512 906 L171 709 L171 315 Z";
const TRUNK = "M628 468 C632 560 702 622 686 702 C674 762 606 776 580 736";
const EAR =
  "M410 318 C330 308 275 375 280 480 C285 575 340 640 420 632 C490 625 520 560 512 480 C505 390 475 325 410 318 Z";
const EAR_FOLD = "M398 368 C352 368 327 415 330 478 C333 535 362 575 405 572";
const TUSK = "M588 598 C600 628 592 652 568 668";

/** Round-joined stroke that softens the hexagon corners, as in the icon. */
const HEXAGON_ROUNDING = 56;
/**
 * The icon's hexagon sits on a Harbor Blue tile. In the app it sits on
 * light surfaces, so a thin ring in the current colour stands in for it.
 */
const HEXAGON_RING = 36;

/**
 * Ordilo's compact brand mark: the filled elephant inside the hexagon, the
 * safe family home. Filled shapes keep the animal readable at favicon and
 * navigation sizes where the larger character would lose detail.
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
      viewBox="0 0 1024 1024"
      fill="none"
      aria-hidden="true"
      className={cn("ordilo-mark", animate && "ordilo-mark--alive", className)}
    >
      <path
        d={HEXAGON}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={HEXAGON_ROUNDING + HEXAGON_RING * 2}
        strokeLinejoin="round"
      />
      <path
        d={HEXAGON}
        fill="var(--surface-box)"
        stroke="var(--surface-box)"
        strokeWidth={HEXAGON_ROUNDING}
        strokeLinejoin="round"
      />

      <g className="ordilo-mark__elephant">
        <g data-part="elephant-silhouette" fill="var(--petrol)">
          <path
            d={TRUNK}
            fill="none"
            stroke="var(--petrol)"
            strokeWidth="84"
            strokeLinecap="round"
          />
          <circle cx="500" cy="480" r="175" />
        </g>
        <path
          data-part="ear"
          d={EAR}
          fill="var(--wash-sage)"
          stroke="var(--petrol-darker)"
          strokeWidth="14"
          strokeLinejoin="round"
        />
        <path
          d={EAR_FOLD}
          fill="none"
          stroke="var(--petrol)"
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.5"
        />
        <circle cx="585" cy="440" r="24" fill="var(--surface-box)" />
        <g className="ordilo-mark__eye">
          <circle cx="589" cy="440" r="13" fill="var(--petrol-darker)" />
        </g>
        <path
          data-part="tusk"
          d={TUSK}
          stroke="var(--apricot)"
          strokeWidth="24"
          strokeLinecap="round"
          className="ordilo-mark__tusk"
        />
      </g>
    </svg>
  );
}
