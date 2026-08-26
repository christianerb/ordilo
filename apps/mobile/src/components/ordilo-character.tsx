import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { colors } from "../theme/tokens";

const SAGE = "#DDEBE5"; // --wash-sage from the web palette
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface OrdiloCharacterProps {
  size?: number;
  /** Set false for a perfectly still character (persistent surfaces). */
  animated?: boolean;
}

/**
 * The Ordilo character — the elephant outside its hexagon, for the
 * opted-in brand moments (onboarding, welcome, celebrations). Two
 * ambient motions only: a slow breath (scale 1 → 1.03 over ~2.4s) and
 * an occasional blink. Both stop entirely under reduce-motion
 * (DESIGN.md accessibility rule).
 */
export function OrdiloCharacter({
  size = 88,
  animated = true,
}: OrdiloCharacterProps) {
  const reduceMotion = useReducedMotion();
  const alive = animated && !reduceMotion;

  const breath = useSharedValue(1);
  const eye = useSharedValue(1);

  useEffect(() => {
    if (!alive) {
      breath.value = 1;
      eye.value = 1;
      return;
    }
    breath.value = withRepeat(
      withTiming(1.035, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // Hold the eye open, blink shut for ~110ms, reopen, repeat.
    eye.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3800 }),
        withTiming(0.08, { duration: 110 }),
        withTiming(1, { duration: 130 }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(breath);
      cancelAnimation(eye);
    };
  }, [alive, breath, eye]);

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  const eyeProps = useAnimatedProps(() => ({ opacity: eye.value }));

  return (
    <Animated.View style={breathStyle}>
      <Svg fill="none" height={size} viewBox="0 0 80 80" width={size}>
        {/* Body */}
        <Path
          d="M22 44 C22 30 33 21 46 22 C58 23 66 32 65 44 C64 55 55 62 43 62 C31 62 22 56 22 44 Z"
          fill={colors.harborBlue}
        />
        {/* Ear */}
        <Path
          d="M30 26 C21 24 14 31 14 41 C14 50 20 56 28 55 C36 54 40 46 39 38 C38 31 35 27 30 26 Z"
          fill={SAGE}
          stroke={colors.harborBlueDarker}
          strokeLinejoin="round"
          strokeWidth={2}
        />
        <Path
          d="M28 31 C23 30 20 34 20 40 C20 45 23 49 27 48"
          fill="none"
          opacity={0.5}
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeWidth={1.2}
        />
        {/* Feet */}
        <Path d="M32 60 h7 v6 a3 3 0 0 1 -3 3 h-1 a3 3 0 0 1 -3 -3 Z" fill={colors.harborBlueDarker} />
        <Path d="M46 60 h7 v6 a3 3 0 0 1 -3 3 h-1 a3 3 0 0 1 -3 -3 Z" fill={colors.harborBlueDarker} />
        {/* Trunk — a warm curve that lifts as if greeting */}
        <Path
          d="M62 38 C70 40 74 47 72 54 C71 59 66 61 62 58"
          fill="none"
          stroke={colors.harborBlue}
          strokeLinecap="round"
          strokeWidth={6}
        />
        {/* Tusk — the tiny apricot accent */}
        <Path
          d="M60 52 C62.5 52 63.5 54 61.5 56.5"
          fill="none"
          stroke={colors.warmApricot}
          strokeLinecap="round"
          strokeWidth={2}
        />
        {/* Face opening kept warm-white, eye blinks */}
        <Path
          d="M44 28 C53 27 59 33 58 41 C57 48 51 52 44 51 C38 50 34 45 35 39 C36 32 39 29 44 28 Z"
          fill={colors.warmWhite}
        />
        <AnimatedCircle
          animatedProps={eyeProps}
          cx={49}
          cy={38}
          fill={colors.harborBlueDarker}
          r={2.1}
        />
      </Svg>
    </Animated.View>
  );
}
