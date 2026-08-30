import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { colors } from "@/src/theme/tokens";

/** Warm, non-interactive scan preview used before the native scanner opens. */
export function ScanHeroIllustration() {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}
    >
      <Svg height="100%" viewBox="0 0 320 230" width="100%">
        <Circle cx={257} cy={160} fill={colors.washSageSoft} r={54} />
        <Circle cx={275} cy={48} fill={colors.warmApricotLight} opacity={0.22} r={7} />
        <Circle cx={53} cy={60} fill={colors.warmApricot} opacity={0.45} r={4} />
        <Circle cx={287} cy={76} fill={colors.harborBlue} opacity={0.28} r={3} />

        <G
          fill="none"
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeWidth={3}
          opacity={0.52}
        >
          <Path d="M88 34 H76 C66 34 62 39 62 49 V61" />
          <Path d="M232 34 H244 C254 34 258 39 258 49 V61" />
          <Path d="M88 196 H76 C66 196 62 191 62 181 V169" />
          <Path d="M232 196 H244 C254 196 258 191 258 181 V169" />
        </G>

        <Rect
          fill={colors.warmWhite}
          height={150}
          rx={8}
          stroke={colors.mistLight}
          width={116}
          x={102}
          y={45}
        />
        <Path d="M190 45 L218 73 H196 C192.7 73 190 70.3 190 67 Z" fill={colors.washApricot} />
        <Path d="M190 45 V67 C190 70.3 192.7 73 196 73 H218" fill="none" stroke={colors.warmApricotLight} />
        <Path d="M121 91 H176 M121 108 H190 M121 125 H183" stroke={colors.sandWarm} strokeLinecap="round" strokeWidth={3} />
        <Path d="M171 161 C177 151 184 151 183 158 C182 164 190 166 198 157" fill="none" stroke={colors.harborBlue} strokeLinecap="round" strokeWidth={2} opacity={0.42} />

        <Path d="M57 211 C59 187 58 169 53 147" fill="none" stroke={colors.harborBlue} strokeLinecap="round" strokeWidth={2} opacity={0.42} />
        <Path d="M54 172 C40 162 32 165 28 170 C35 182 43 186 55 183 Z" fill={colors.washSage} />
        <Path d="M52 154 C62 139 72 138 77 141 C74 157 66 165 54 165 Z" fill={colors.washSage} />
        <Path d="M46 192 C34 184 24 188 20 193 C29 203 37 206 48 202 Z" fill={colors.washSageSoft} />

        <Path d="M65 120 H255" stroke={colors.harborBlue} strokeLinecap="round" strokeWidth={3} />
        <Path d="M80 120 H240" stroke={colors.washSage} strokeLinecap="round" strokeWidth={10} opacity={0.48} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 230,
    width: "100%",
  },
});
