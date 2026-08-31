import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

import { colors } from "@/src/theme/tokens";

/**
 * The warm "code is on its way" moment for the login confirmation: a
 * sage envelope with a heart card peeking out, a sprig on the left and
 * a dotted flight path ending in a heart on the right — the mobile
 * counterpart to the web's auth illustration language. Decorative only.
 */
export function MailSentIllustration() {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}
    >
      <Svg height={190} viewBox="0 0 300 190" width="100%">
        {/* ambient warm washes */}
        <Circle cx={150} cy={98} fill={colors.washApricot} opacity={0.55} r={82} />
        <Circle cx={88} cy={120} fill={colors.washSage} opacity={0.7} r={46} />

        {/* sprig on the left */}
        <Path
          d="M66 158 C60 128 58 108 62 88"
          fill="none"
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeWidth={2}
        />
        <Ellipse cx={54} cy={104} fill={colors.washSage} rx={10} ry={6} stroke={colors.harborBlue} strokeWidth={1.5} transform="rotate(-30 54 104)" />
        <Ellipse cx={72} cy={122} fill={colors.washSage} rx={10} ry={6} stroke={colors.harborBlue} strokeWidth={1.5} transform="rotate(25 72 122)" />
        <Ellipse cx={54} cy={138} fill={colors.washSage} rx={9} ry={5.5} stroke={colors.harborBlue} strokeWidth={1.5} transform="rotate(-35 54 138)" />

        {/* envelope body */}
        <Rect
          fill={colors.washSage}
          height={72}
          rx={10}
          stroke={colors.harborBlue}
          strokeWidth={1.5}
          width={110}
          x={95}
          y={88}
        />
        {/* envelope flap */}
        <Path
          d="M97 92 L150 132 L203 92"
          fill="none"
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
        {/* heart card peeking out */}
        <Rect
          fill={colors.warmWhite}
          height={48}
          rx={6}
          stroke={colors.mistLight}
          width={64}
          x={118}
          y={46}
        />
        <Path
          d="M150 82 C147 76 139 76 139 83 C139 87 144 90 150 94 C156 90 161 87 161 83 C161 76 153 76 150 82 Z"
          fill={colors.warmApricot}
        />

        {/* dotted flight path to the small heart */}
        <Path
          d="M212 70 C232 58 240 46 236 32"
          fill="none"
          stroke={colors.mistDark}
          strokeDasharray="1 6"
          strokeLinecap="round"
          strokeWidth={2}
        />
        <Path
          d="M236 24 C234 20 229 20 229 24 C229 27 232 29 236 32 C240 29 243 27 243 24 C243 20 238 20 236 24 Z"
          fill={colors.washSage}
          stroke={colors.harborBlue}
          strokeWidth={1.25}
        />

        {/* quiet confetti dots */}
        <Circle cx={222} cy={118} fill={colors.warmApricot} opacity={0.6} r={3} />
        <Circle cx={230} cy={130} fill={colors.mistLight} r={2.5} />
        <Circle cx={80} cy={60} fill={colors.washApricot} r={3} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: "center",
    height: 190,
    width: 300,
  },
});
