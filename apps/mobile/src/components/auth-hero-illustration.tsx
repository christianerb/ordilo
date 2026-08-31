import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

import { OrdiloCharacter } from "@/src/components/ordilo-character";
import { colors } from "@/src/theme/tokens";

/**
 * The signed-out brand moment from the intro and login screens: the
 * Ordilo character resting between sage sprigs on a warm apricot wash.
 * The "login" variant adds the envelope with the heart seal — the code
 * is already on its way in spirit. The character itself stays a real
 * OrdiloCharacter so breathing and blinking come for free (and stop
 * under reduce-motion). Decorative only.
 */
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 170;

export function AuthHeroIllustration({
  variant = "login",
  scale = 1,
}: {
  variant?: "login" | "einstieg";
  /** Scales the whole scene so short screens (SE) keep the CTAs on-screen. */
  scale?: number;
}) {
  const withEnvelope = variant === "login";
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.frame,
        { height: FRAME_HEIGHT * scale, width: FRAME_WIDTH * scale },
      ]}
    >
      <View
        style={{
          height: FRAME_HEIGHT,
          left: (FRAME_WIDTH * scale - FRAME_WIDTH) / 2,
          position: "absolute",
          top: (FRAME_HEIGHT * scale - FRAME_HEIGHT) / 2,
          transform: [{ scale }],
          width: FRAME_WIDTH,
        }}
      >
        <Svg height={FRAME_HEIGHT} viewBox="0 0 320 170" width={FRAME_WIDTH}>
        {/* warm apricot wash anchoring the scene */}
        <Circle
          cx={withEnvelope ? 232 : 210}
          cy={76}
          fill={colors.washApricot}
          opacity={0.55}
          r={94}
        />
        <Circle cx={74} cy={120} fill={colors.washSage} opacity={0.6} r={52} />

        {/* left sprig */}
        <Path
          d="M34 158 C30 128 30 104 38 84"
          fill="none"
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeWidth={2}
        />
        <Ellipse cx={24} cy={100} fill={colors.washSage} rx={10} ry={6} stroke={colors.harborBlue} strokeWidth={1.5} transform="rotate(-30 24 100)" />
        <Ellipse cx={44} cy={118} fill={colors.washSage} rx={10} ry={6} stroke={colors.harborBlue} strokeWidth={1.5} transform="rotate(25 44 118)" />
        <Ellipse cx={24} cy={136} fill={colors.washSage} rx={9} ry={5.5} stroke={colors.harborBlue} strokeWidth={1.5} transform="rotate(-35 24 136)" />

        {/* right sprig */}
        <Path
          d="M292 160 C296 130 296 108 288 88"
          fill="none"
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeWidth={2}
        />
        <Ellipse cx={300} cy={104} fill={colors.washSage} rx={10} ry={6} stroke={colors.harborBlue} strokeWidth={1.5} transform="rotate(30 300 104)" />
        <Ellipse cx={282} cy={124} fill={colors.washSage} rx={10} ry={6} stroke={colors.harborBlue} strokeWidth={1.5} transform="rotate(-25 282 124)" />
        <Ellipse cx={300} cy={142} fill={colors.washSage} rx={9} ry={5.5} stroke={colors.harborBlue} strokeWidth={1.5} transform="rotate(35 300 142)" />

        {withEnvelope ? (
          <>
            {/* envelope with the heart seal */}
            <Rect
              fill={colors.warmWhite}
              height={62}
              rx={8}
              stroke={colors.mistLight}
              strokeWidth={1.5}
              width={90}
              x={194}
              y={82}
            />
            <Path
              d="M196 88 L239 118 L282 88"
              fill="none"
              stroke={colors.mistDark}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
            <Path
              d="M239 104 C237 100 231 100 231 105 C231 108 235 111 239 114 C243 111 247 108 247 105 C247 100 241 100 239 104 Z"
              fill={colors.warmApricot}
            />
            {/* a heart drifting up */}
            <Path
              d="M178 42 C176 38 170 38 170 43 C170 46 174 49 178 52 C182 49 186 46 186 43 C186 38 180 38 178 42 Z"
              fill={colors.warmApricot}
              opacity={0.85}
            />
          </>
        ) : (
          <>
            {/* quiet floating hearts above the character */}
            <Path
              d="M120 36 C118 32 112 32 112 37 C112 40 116 43 120 46 C124 43 128 40 128 37 C128 32 122 32 120 36 Z"
              fill={colors.washSage}
              stroke={colors.harborBlue}
              strokeWidth={1.25}
            />
            <Path
              d="M214 30 C212 26 206 26 206 31 C206 34 210 37 214 40 C218 37 222 34 222 31 C222 26 216 26 214 30 Z"
              fill={colors.warmApricot}
              opacity={0.85}
            />
          </>
        )}

        {/* quiet confetti dots */}
        <Circle cx={160} cy={20} fill={colors.mistLight} r={2.5} />
        <Circle cx={56} cy={52} fill={colors.washApricot} r={3} />
        <Circle cx={270} cy={40} fill={colors.mistLight} r={2.5} />
        </Svg>
        <View
          style={[
            styles.character,
            withEnvelope ? styles.characterLogin : styles.characterEinstieg,
          ]}
        >
          <OrdiloCharacter size={withEnvelope ? 108 : 122} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: "center",
  },
  character: {
    position: "absolute",
  },
  characterLogin: {
    left: 66,
    top: 44,
  },
  characterEinstieg: {
    left: 84,
    top: 36,
  },
});
