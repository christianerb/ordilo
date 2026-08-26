import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";

import { colors } from "@/src/theme/tokens";

const SAGE = "#DDEBE5"; // --wash-sage from the web palette

/**
 * The Shared Canvas from DESIGN.md, ported to native: two or three
 * large, low-contrast organic fields (Harbor Blue, Sage, Apricot washes)
 * resting behind the content. They are atmospheric only — never
 * interactive, never informative, hidden from assistive technology, and
 * cropped by the screen edges so primary content always wins on a phone.
 *
 * Place once per screen, as the first child of a relative container:
 *
 *   <View style={{ flex: 1 }}>
 *     <AmbientFields />
 *     <ScrollView>...</ScrollView>
 *   </View>
 */
export function AmbientFields({
  variant = "default",
  style,
}: {
  /** "top" keeps the upper region busy (behind greetings), "default" spreads. */
  variant?: "default" | "top";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      {/* The one permitted ambient gradient: a barely-visible
          Warm White → Sand wash, single-hue, straight from DESIGN.md. */}
      <LinearGradient
        colors={[colors.warmWhite, colors.sand]}
        end={{ x: 0.5, y: 1 }}
        start={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
        {/* Harbor Blue glow, top right — ties the neutrals to the brand. */}
        <Circle
          cx="92%"
          cy={variant === "top" ? "4%" : "-2%"}
          fill={colors.harborBlue}
          opacity={0.06}
          r={180}
        />
        {/* Sage field, drifting left. */}
        <Circle
          cx="-14%"
          cy={variant === "top" ? "26%" : "38%"}
          fill={SAGE}
          opacity={0.55}
          r={150}
        />
        {/* Softly rotated apricot-warm rectangle, low and quiet. */}
        <Rect
          fill={colors.warmApricot}
          height={200}
          opacity={0.05}
          rx={28}
          transform="rotate(-12 330 720)"
          width={200}
          x="72%"
          y="88%"
        />
      </Svg>
    </View>
  );
}
