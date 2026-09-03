import { Check } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useEffect } from "react";

import { colors, sizes } from "@/src/theme/tokens";

/**
 * The one task checkbox: a 28pt circle inside a 44pt target. Open is a
 * thin mist ring; done fills harbor blue with a settling spring. Busy
 * shows a small spinner in place so a slow write never looks ignored.
 */
export function TaskCheck({
  accessibilityLabel,
  busy = false,
  done,
  onToggle,
  size = 28,
}: {
  accessibilityLabel: string;
  busy?: boolean;
  done: boolean;
  onToggle: () => void;
  size?: number;
}) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      scale.set(1);
      return;
    }
    scale.set(0.82);
    scale.set(withSpring(1, { damping: 14, stiffness: 260, mass: 0.6 }));
  }, [done, reduceMotion, scale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done, disabled: busy }}
      disabled={busy}
      hitSlop={6}
      onPress={onToggle}
      style={styles.target}
    >
      <Animated.View
        style={[
          styles.ring,
          { borderRadius: size / 2, height: size, width: size },
          done && styles.ringDone,
          ringStyle,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={done ? colors.warmWhite : colors.harborBlue} size="small" />
        ) : done ? (
          <Check color={colors.warmWhite} size={Math.round(size * 0.58)} strokeWidth={3} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    alignItems: "center",
    height: sizes.touch,
    justifyContent: "center",
    width: sizes.touch,
  },
  ring: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mist,
    borderWidth: 2,
    justifyContent: "center",
  },
  ringDone: {
    backgroundColor: colors.harborBlue,
    borderColor: colors.harborBlue,
  },
});
