import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { durations, easeInOut, easeOut } from "@/src/theme/motion";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

/**
 * The one sheet of the native app — the counterpart to the web's
 * OrdiloDrawer. Bottom-anchored, warm white, 28px top radius (the
 * DESIGN.md ceiling), drag-to-dismiss with a dimming backdrop, and a
 * safe-area-aware body that scrolls when the content outgrows the
 * phone. Present imperatively via a ref:
 *
 *   const sheetRef = useRef<OrdiloSheetHandle>(null);
 *   sheetRef.current?.present();
 */
export type OrdiloSheetHandle = BottomSheetModal;

interface OrdiloSheetProps {
  children?: ReactNode;
  /** Called after the sheet has fully dismissed (swipe, backdrop, or close). */
  onDismiss?: () => void;
  /** Accessible name for the sheet region. */
  accessibilityLabel?: string;
}

/**
 * Bridges declarative open state to the imperative sheet. Keeps the
 * modal mounted (so dismissal animates) while callers keep their
 * familiar `visible` boolean:
 *
 *   const ref = useSheetPresentation(open);
 *   <OrdiloSheet ref={ref} onDismiss={() => setOpen(false)}>…</OrdiloSheet>
 */
export function useSheetPresentation(open: boolean) {
  const ref = useRef<OrdiloSheetHandle>(null);
  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);
  return ref;
}

function renderBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.28}
      pressBehavior="close"
    />
  );
}

export const OrdiloSheet = forwardRef<OrdiloSheetHandle, OrdiloSheetProps>(
  function OrdiloSheet({ children, onDismiss, accessibilityLabel }, ref) {
    const insets = useSafeAreaInsets();

    return (
      <BottomSheetModal
        accessibilityLabel={accessibilityLabel}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.background}
        enableDynamicSizing
        handleIndicatorStyle={styles.handleIndicator}
        handleStyle={styles.handle}
        onDismiss={onDismiss}
        ref={ref}
      >
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: spacing.lg + insets.bottom },
          ]}
        >
          {children}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

/**
 * Bottom-anchored modal with the motion split a raw Modal cannot do:
 * the dimming overlay only fades while the sheet itself travels from
 * below the screen — instead of the whole wall of grey sliding up.
 * Dismissal animates out before unmounting, so both directions read as
 * one calm motion. Under Reduce Motion the sheet keeps its place and
 * only the fade remains.
 */
export function AnimatedSheetModal({
  children,
  dismissDisabled = false,
  keyboardAvoiding = false,
  onClose,
  sheetStyle,
  visible,
}: {
  children: ReactNode;
  /** Blocks backdrop-tap and back-button dismissal (e.g. while saving). */
  dismissDisabled?: boolean;
  /** Lifts the sheet above the software keyboard (iOS padding behavior). */
  keyboardAvoiding?: boolean;
  onClose: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  visible: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const overlayOpacity = useSharedValue(0);
  const sheetOffset = useSharedValue(windowHeight);

  // Mount synchronously on open (React's guarded render adjustment) so the
  // entry animation has something to animate; exit unmounts via runOnJS.
  if (visible && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      // Entry: the overlay fades in while the sheet slides up.
      overlayOpacity.value = 0;
      sheetOffset.value = reduceMotion ? 0 : windowHeight;
      overlayOpacity.value = withTiming(1, {
        duration: durations.base,
        easing: easeOut,
      });
      sheetOffset.value = withTiming(0, {
        duration: reduceMotion ? durations.fast : 250,
        easing: easeOut,
      });
      return;
    }
    // Exit: reverse motion, then unmount — the overlay never travels.
    overlayOpacity.value = withTiming(0, {
      duration: durations.fast,
      easing: easeInOut,
    });
    sheetOffset.value = withTiming(
      reduceMotion ? 0 : windowHeight,
      { duration: durations.fast, easing: easeInOut },
      (finished) => {
        "worklet";
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [visible, mounted, reduceMotion, windowHeight, overlayOpacity, sheetOffset]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetOffset.value }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      animationType="none"
      onRequestClose={dismissDisabled ? undefined : onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.modalOverlay, overlayStyle]}>
          <Pressable
            accessibilityLabel="Schließen"
            accessibilityRole="button"
            onPress={dismissDisabled ? undefined : onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            pointerEvents="box-none"
            style={styles.modalSheetSlot}
          >
            <Animated.View
              accessibilityViewIsModal
              style={[styles.modalSheet, sheetStyle, sheetAnimatedStyle]}
            >
              {children}
            </Animated.View>
          </KeyboardAvoidingView>
        ) : (
          <View pointerEvents="box-none" style={styles.modalSheetSlot}>
            <Animated.View
              accessibilityViewIsModal
              style={[styles.modalSheet, sheetStyle, sheetAnimatedStyle]}
            >
              {children}
            </Animated.View>
          </View>
        )}
      </View>
    </Modal>
  );
}

/**
 * Declarative form-sheet shell for flows that need to intercept a close
 * request before dismissing, such as unsaved task or member edits. Picker
 * sheets keep using OrdiloSheet above, which delegates dragging and
 * presentation to @gorhom/bottom-sheet.
 */
export function OrdiloFormSheet({
  children,
  closeAccessibilityLabel,
  onClose,
  style,
  title,
  visible,
}: {
  children: ReactNode;
  closeAccessibilityLabel?: string;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  title: string;
  visible: boolean;
}) {
  return (
    <AnimatedSheetModal
      onClose={onClose}
      sheetStyle={[styles.formSheetPadding, style]}
      visible={visible}
    >
      <View style={styles.formHandle} />
      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>{title}</Text>
        <Pressable
          accessibilityLabel={closeAccessibilityLabel ?? `${title} schließen`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={styles.formClose}
        >
          <X color={colors.graphite} size={19} strokeWidth={2} />
        </Pressable>
      </View>
      {children}
    </AnimatedSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.warmWhite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  handle: {
    paddingTop: spacing.sm,
  },
  handleIndicator: {
    backgroundColor: colors.mistLight,
    width: 40,
  },
  modalRoot: {
    flex: 1,
  },
  modalOverlay: {
    backgroundColor: "rgba(38, 36, 33, 0.28)",
  },
  modalSheetSlot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.warmWhite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "88%",
  },
  formSheetPadding: {
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  formHandle: {
    alignSelf: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    width: 40,
  },
  formHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  formTitle: { color: colors.graphite, flex: 1, ...typography.display },
  formClose: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
});
