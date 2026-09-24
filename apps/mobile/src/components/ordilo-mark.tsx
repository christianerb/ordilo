import Svg, { Circle, G, Path } from "react-native-svg";

import { colors } from "../theme/tokens";

interface OrdiloMarkProps {
  size?: number;
}

/**
 * Geometry of the app icon (scripts/render-app-icons.mjs, 1024-unit
 * canvas). Keep both in sync so the mark in the app is the icon on the
 * home screen. The web mark (src/components/ordilo/ordilo-mark.tsx) uses
 * the same paths.
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
 * Warm White and Sand, so a thin Harbor Blue ring stands in for the tile.
 */
const HEXAGON_RING = 36;

/**
 * Ordilo's compact brand mark: the filled elephant inside the hexagon.
 * Static on purpose: persistent navigation keeps the mark calm, and
 * native motion only belongs in opted-in brand moments (DESIGN.md).
 */
export function OrdiloMark({ size = 32 }: OrdiloMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
      <Path
        d={HEXAGON}
        fill={colors.harborBlue}
        stroke={colors.harborBlue}
        strokeWidth={HEXAGON_ROUNDING + HEXAGON_RING * 2}
        strokeLinejoin="round"
      />
      <Path
        d={HEXAGON}
        fill={colors.warmWhite}
        stroke={colors.warmWhite}
        strokeWidth={HEXAGON_ROUNDING}
        strokeLinejoin="round"
      />
      <G>
        <Path
          d={TRUNK}
          stroke={colors.harborBlue}
          strokeWidth={84}
          strokeLinecap="round"
        />
        <Circle cx={500} cy={480} r={175} fill={colors.harborBlue} />
        <Path
          d={EAR}
          fill={colors.washSage}
          stroke={colors.harborBlueDarker}
          strokeWidth={14}
          strokeLinejoin="round"
        />
        <Path
          d={EAR_FOLD}
          stroke={colors.harborBlue}
          strokeWidth={12}
          strokeLinecap="round"
          opacity={0.5}
        />
        <Circle cx={585} cy={440} r={24} fill={colors.warmWhite} />
        <Circle cx={589} cy={440} r={13} fill={colors.harborBlueDarker} />
        <Path
          d={TUSK}
          stroke={colors.warmApricot}
          strokeWidth={24}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}
