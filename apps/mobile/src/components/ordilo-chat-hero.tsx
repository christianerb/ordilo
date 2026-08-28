import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";

import { colors } from "@/src/theme/tokens";

/**
 * A calm journal illustration for the first moment of a conversation.
 * Ordilo rises out of the page instead of sitting inside the compact
 * navigation mark, making the empty chat feel like a personal welcome.
 */
export function OrdiloChatHero() {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}
    >
      <Svg height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 360 270" width="100%">
        <Path
          d="M0 0 H360 V112 C312 91 276 102 236 86 C192 68 151 43 103 55 C60 65 31 88 0 99 Z"
          fill={colors.sand}
        />
        <Circle cx={303} cy={52} fill={colors.warmApricotLight} opacity={0.72} r={26} />
        <Circle cx={320} cy={32} fill={colors.warmApricot} opacity={0.16} r={8} />

        <Path
          d="M19 254 C35 226 45 198 43 168 C42 144 56 126 79 122 C98 119 112 128 121 145 C136 120 160 109 187 114 C221 120 242 147 243 180 L244 254 Z"
          fill={colors.washSage}
        />
        <Ellipse cx={128} cy={165} fill={colors.washSageSoft} rx={49} ry={57} />
        <Ellipse cx={125} cy={164} fill={colors.harborBlue} opacity={0.07} rx={31} ry={39} />
        <Path
          d="M210 147 C239 150 258 139 260 114 C261 100 258 84 266 77 C272 72 281 75 284 83 C294 110 290 142 271 162 C257 177 240 184 220 183"
          fill="none"
          stroke={colors.washSage}
          strokeLinecap="round"
          strokeWidth={31}
        />
        <Path
          d="M149 212 C145 230 146 246 147 264 M205 211 C210 231 209 246 207 264"
          fill="none"
          opacity={0.32}
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeWidth={3}
        />
        <Circle cx={205} cy={145} fill={colors.harborBlueDarker} r={4.8} />
        <Path
          d="M212 170 C220 179 230 180 239 176"
          fill="none"
          stroke={colors.harborBlueDarker}
          strokeLinecap="round"
          strokeWidth={2.4}
        />

        <Path
          d="M288 240 C291 210 292 181 294 153"
          fill="none"
          opacity={0.55}
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeWidth={2}
        />
        <Path
          d="M294 196 C308 183 319 184 323 186 C316 202 305 207 294 207 Z"
          fill={colors.washSage}
        />
        <Path
          d="M293 174 C282 161 274 160 270 162 C274 177 282 183 293 184 Z"
          fill={colors.washSage}
        />
        <Path
          d="M64 244 C63 219 61 203 56 184 M58 205 C47 195 38 196 34 199 C41 211 49 215 59 214"
          fill="none"
          opacity={0.44}
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeWidth={2}
        />
        <Path
          d="M0 224 C46 206 76 221 112 235 C158 253 202 248 243 232 C288 215 322 215 360 229 V270 H0 Z"
          fill={colors.warmWhite}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 270,
    marginHorizontal: -16,
    overflow: "hidden",
    width: "100%",
  },
});
