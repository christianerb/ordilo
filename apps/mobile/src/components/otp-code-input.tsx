import { useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const CODE_LENGTH = 6;

/**
 * The six-box one-time-code entry, native counterpart to the web's
 * OtpCodeInput. A single hidden TextInput carries focus, number-pad
 * keyboard and iOS oneTimeCode autofill (QuickType fills all boxes from
 * the SMS/mail suggestion); the boxes are a purely visual segmentation
 * of its value, so paste and autofill just work. The active box is the
 * next empty position, marked with the harbor-blue focus border.
 */
export function OtpCodeInput({
  accessibilityLabel = "Anmelde-Code",
  autoFocus = false,
  disabled = false,
  invalid = false,
  onChange,
  value,
}: {
  accessibilityLabel?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (code: string) => void;
  value: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <Pressable
      disabled={disabled}
      onPress={() => inputRef.current?.focus()}
      style={styles.boxes}
    >
      {Array.from({ length: CODE_LENGTH }, (_, index) => {
        const digit = value[index] ?? "";
        const isActive = focused && index === activeIndex;
        return (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            key={index}
            style={[
              styles.box,
              isActive && styles.boxActive,
              invalid && styles.boxInvalid,
            ]}
          >
            <Text style={styles.digit}>{digit}</Text>
          </View>
        );
      })}
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoComplete="sms-otp"
        autoFocus={autoFocus}
        caretHidden
        editable={!disabled}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        onBlur={() => setFocused(false)}
        onChangeText={(text) => {
          onChange(text.replace(/\D/g, "").slice(0, CODE_LENGTH));
        }}
        onFocus={() => setFocused(true)}
        ref={inputRef}
        style={styles.hiddenInput}
        textContentType="oneTimeCode"
        value={value}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boxes: {
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  box: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    width: 46,
  },
  boxActive: {
    borderColor: colors.harborBlue,
    borderWidth: 2,
  },
  boxInvalid: {
    borderColor: colors.destructive,
  },
  digit: {
    color: colors.graphite,
    fontFamily: typography.display.fontFamily,
    fontSize: 24,
  },
  hiddenInput: {
    bottom: 0,
    color: "transparent",
    left: 0,
    opacity: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
