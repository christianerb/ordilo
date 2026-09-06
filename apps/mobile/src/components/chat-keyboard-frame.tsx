import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme/tokens";

/** The keyboard uses screen coordinates; a sheet's content has a different origin. */
export function ChatKeyboardFrame({ children, composer, footerStyle }: {
  children: React.ReactNode; composer: React.ReactNode; footerStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const frame = useRef<View>(null);
  const [offset, setOffset] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const measureOrigin = useCallback(() => {
    frame.current?.measureInWindow((_x, _y, _width, height) => {
      // UIKit sheet measurements omit the presenting window's top inset.
      // This frame fills the screen down to its bottom, so its height gives
      // the actual screen origin without guessing a status/header height.
      setOffset(Math.max(0, Dimensions.get("window").height - height));
    });
  }, []);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => {
      setKeyboardVisible(true); measureOrigin();
    });
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardVisible(false));
    const change = Keyboard.addListener("keyboardWillChangeFrame", measureOrigin);
    return () => { show.remove(); hide.remove(); change.remove(); };
  }, [measureOrigin]);
  return <View ref={frame} collapsable={false} style={styles.flex} onLayout={measureOrigin}>
    <KeyboardAvoidingView keyboardVerticalOffset={offset} behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      {children}
      <View style={[styles.footer, footerStyle, { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8) }]}>{composer}</View>
    </KeyboardAvoidingView>
  </View>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { backgroundColor: colors.warmWhite, paddingHorizontal: 20, paddingTop: 12 },
});
