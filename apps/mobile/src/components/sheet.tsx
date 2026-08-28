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

const DETACHED_SHEET_BOTTOM_RADIUS = 40;

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
  /** Optional content spacing for composed sheet variants. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Float the complete sheet inside the viewport instead of touching its edges. */
  detached?: boolean;
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
  function OrdiloSheet(
    {
      children,
      contentContainerStyle,
      detached = false,
      onDismiss,
      accessibilityLabel,
    },
    ref,
  ) {
    const insets = useSafeAreaInsets();

    return (
      <BottomSheetModal
        accessibilityLabel={accessibilityLabel}
        backdropComponent={renderBackdrop}
        backgroundStyle={[
          styles.background,
          detached && styles.detachedBackground,
        ]}
        bottomInset={detached ? spacing.md : 0}
        detached={detached}
        enableDynamicSizing
        handleIndicatorStyle={styles.handleIndicator}
        handleStyle={styles.handle}
        onDismiss={onDismiss}
        ref={ref}
        style={detached ? styles.detachedSheet : undefined}
      >
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.content,
            contentContainerStyle,
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
  detached = false,
  dismissDisabled = false,
  keyboardAvoiding = false,
  onClose,
  sheetStyle,
  visible,
}: {
  children: ReactNode;
  /** Inset the complete modal sheet from the phone edges. */
  detached?: boolean;
  /** Blocks backdrop-tap and back-button dismissal (e.g. while saving). */
  dismissDisabled?: boolean;
  /** Lifts the sheet above the software keyboard (iOS padding behavior). */
  keyboardAvoiding?: boolean;
  onClose: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
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
            style={[
              styles.modalSheetSlot,
              detached && styles.detachedModalSheetSlot,
              detached && {
                paddingBottom: Math.max(insets.bottom, spacing.md),
              },
            ]}
          >
            <Animated.View
              accessibilityViewIsModal
              style={[
                styles.modalSheet,
                detached && styles.detachedModalSheet,
                sheetStyle,
                sheetAnimatedStyle,
              ]}
            >
              {children}
            </Animated.View>
          </KeyboardAvoidingView>
        ) : (
          <View
            pointerEvents="box-none"
            style={[
              styles.modalSheetSlot,
              detached && styles.detachedModalSheetSlot,
              detached && {
                paddingBottom: Math.max(insets.bottom, spacing.md),
              },
            ]}
          >
            <Animated.View
              accessibilityViewIsModal
              style={[
                styles.modalSheet,
                detached && styles.detachedModalSheet,
                sheetStyle,
                sheetAnimatedStyle,
              ]}
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
  dismissDisabled = false,
  keyboardAvoiding = false,
  onClose,
  style,
  subtitle,
  title,
  titleAlign = "left",
  visible,
}: {
  children: ReactNode;
  closeAccessibilityLabel?: string;
  dismissDisabled?: boolean;
  keyboardAvoiding?: boolean;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  title: string;
  titleAlign?: "left" | "center";
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <AnimatedSheetModal
      dismissDisabled={dismissDisabled}
      keyboardAvoiding={keyboardAvoiding}
      onClose={onClose}
      sheetStyle={[
        styles.formSheetPadding,
        { paddingBottom: Math.max(spacing.lg, insets.bottom) },
        style,
      ]}
      visible={visible}
    >
      <View style={styles.formHandle} />
      <View style={styles.formHeader}>
        <View
          style={[
            styles.formHeading,
            titleAlign === "center" && styles.formHeadingCentered,
          ]}
        >
          <Text
            style={[
              styles.formTitle,
              titleAlign === "center" && styles.formTitleCentered,
            ]}
          >
            {title}
          </Text>
          {subtitle ? <Text style={styles.formSubtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable
          accessibilityLabel={closeAccessibilityLabel ?? `${title} schließen`}
          accessibilityRole="button"
          disabled={dismissDisabled}
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
  detachedBackground: {
    borderBottomLeftRadius: DETACHED_SHEET_BOTTOM_RADIUS,
    borderBottomRightRadius: DETACHED_SHEET_BOTTOM_RADIUS,
  },
  detachedSheet: {
    marginHorizontal: spacing.md,
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
  detachedModalSheetSlot: {
    paddingHorizontal: spacing.md,
  },
  detachedModalSheet: {
    borderBottomLeftRadius: DETACHED_SHEET_BOTTOM_RADIUS,
    borderBottomRightRadius: DETACHED_SHEET_BOTTOM_RADIUS,
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
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  formHeading: { flex: 1, gap: 2 },
  formHeadingCentered: {
    alignItems: "center",
    marginLeft: 44,
  },
  formTitle: { color: colors.graphite, ...typography.display },
  formTitleCentered: {
    fontSize: 24,
    lineHeight: 31,
    textAlign: "center",
  },
  formSubtitle: { color: colors.mistDark, ...typography.timestamp },
  formClose: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
});
