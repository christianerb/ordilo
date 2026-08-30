import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Sprout, X } from "lucide-react-native";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
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

const FLOATING_SHEET_BOTTOM_RADIUS = 40;
const FLOATING_SHEET_INSET = spacing.md;

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

/** Shared visual header from the Dokumente "+" sheet. */
export function OrdiloSheetHeader({
  closeAccessibilityLabel,
  closeDisabled = false,
  onClose,
  subtitle,
  title,
}: {
  closeAccessibilityLabel?: string;
  closeDisabled?: boolean;
  onClose?: () => void;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.sheetHeader}>
      <View
        style={[
          styles.sheetHeaderCopy,
          onClose && styles.sheetHeaderCopyWithClose,
        ]}
      >
        <Text style={styles.sheetHeaderTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.sheetHeaderSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.sheetHeaderDecoration,
          onClose && styles.sheetHeaderDecorationWithClose,
        ]}
      >
        <View style={styles.sheetHeaderWash} />
        <View style={styles.sheetHeaderDot} />
        <Sprout color={colors.harborBlue} size={34} strokeWidth={1.35} />
      </View>
      {onClose ? (
        <Pressable
          accessibilityLabel={closeAccessibilityLabel ?? `${title} schließen`}
          accessibilityRole="button"
          disabled={closeDisabled}
          hitSlop={8}
          onPress={onClose}
          style={styles.sheetHeaderClose}
        >
          <X color={colors.graphite} size={19} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
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
        bottomInset={
          detached ? Math.max(FLOATING_SHEET_INSET, insets.bottom) : 0
        }
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
  closeAccessibilityLabel = "Schließen",
  dismissDisabled = false,
  keyboardAvoiding = false,
  onClose,
  onDismiss,
  sheetStyle,
  visible,
}: {
  children: ReactNode;
  closeAccessibilityLabel?: string;
  /** Blocks backdrop-tap and back-button dismissal (e.g. while saving). */
  dismissDisabled?: boolean;
  /** Lifts the sheet above the software keyboard (iOS padding behavior). */
  keyboardAvoiding?: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  visible: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  // Lift the floating sheet clear of the home indicator so its bottom
  // rounding is never crossed by it (DESIGN.md: bottom-anchored drawers
  // pad by the safe-area inset).
  const slotBottomInset = Math.max(FLOATING_SHEET_INSET, insets.bottom);
  const overlayOpacity = useSharedValue(0);
  const sheetOffset = useSharedValue(windowHeight);
  const finishDismiss = useCallback(() => {
    setMounted(false);
    onDismiss?.();
  }, [onDismiss]);

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
        if (finished) runOnJS(finishDismiss)();
      },
    );
  }, [
    visible,
    mounted,
    reduceMotion,
    windowHeight,
    overlayOpacity,
    sheetOffset,
    finishDismiss,
  ]);

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
      visible={mounted}
    >
      <View style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.modalOverlay, overlayStyle]}>
          <Pressable
            accessibilityLabel={closeAccessibilityLabel}
            accessibilityRole="button"
            disabled={dismissDisabled}
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            pointerEvents="box-none"
            style={[
              styles.modalSheetSlot,
              { paddingBottom: slotBottomInset },
            ]}
          >
            <Animated.View
              accessibilityViewIsModal
              style={[styles.modalSheet, sheetStyle, sheetAnimatedStyle]}
            >
              {children}
            </Animated.View>
          </KeyboardAvoidingView>
        ) : (
          <View
            pointerEvents="box-none"
            style={[
              styles.modalSheetSlot,
              { paddingBottom: slotBottomInset },
            ]}
          >
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
 * Floating sheet nested inside another sheet. It shares the exact exterior
 * inset, corner geometry and handle instead of recreating a local panel.
 */
export function OrdiloNestedSheet({
  children,
  closeAccessibilityLabel = "Auswahl schließen",
  contained = false,
  dismissDisabled = false,
  onClose,
  visible,
}: {
  children: ReactNode;
  closeAccessibilityLabel?: string;
  /** Keep the overlay inside an already-floating parent sheet. */
  contained?: boolean;
  dismissDisabled?: boolean;
  onClose: () => void;
  visible: boolean;
}) {
  if (!visible) return null;

  if (!contained) {
    return (
      <AnimatedSheetModal
        closeAccessibilityLabel={closeAccessibilityLabel}
        dismissDisabled={dismissDisabled}
        onClose={onClose}
        sheetStyle={styles.nestedPanel}
        visible
      >
        {children}
      </AnimatedSheetModal>
    );
  }

  return (
    <View
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={styles.nestedOverlay}
    >
      <Pressable
        accessibilityLabel={closeAccessibilityLabel}
        accessibilityRole="button"
        disabled={dismissDisabled}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.nestedPanel}>
        <View style={styles.floatingHandle} />
        {children}
      </View>
    </View>
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
  onDismiss,
  subtitle,
  title,
  visible,
}: {
  children: ReactNode;
  closeAccessibilityLabel?: string;
  dismissDisabled?: boolean;
  keyboardAvoiding?: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  subtitle?: string;
  title: string;
  visible: boolean;
}) {
  return (
    <AnimatedSheetModal
      dismissDisabled={dismissDisabled}
      keyboardAvoiding={keyboardAvoiding}
      onClose={onClose}
      onDismiss={onDismiss}
      // The modal slot already lifts the sheet clear of the home
      // indicator; inside, one calm spacing step of rhythm is enough.
      sheetStyle={styles.formSheetPadding}
      visible={visible}
    >
      <View style={styles.floatingHandle} />
      <OrdiloSheetHeader
        closeAccessibilityLabel={closeAccessibilityLabel}
        closeDisabled={dismissDisabled}
        onClose={onClose}
        subtitle={subtitle}
        title={title}
      />
      {children}
    </AnimatedSheetModal>
  );
}

/** The single scrolling body rhythm for every create/edit form sheet. */
export const OrdiloFormBody = forwardRef<
  ScrollView,
  {
    children: ReactNode;
    contentContainerStyle?: StyleProp<ViewStyle>;
  }
>(function OrdiloFormBody({ children, contentContainerStyle }, ref) {
  return (
    <ScrollView
      contentContainerStyle={[styles.formBodyContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      ref={ref}
      showsVerticalScrollIndicator={false}
      style={styles.formBody}
    >
      {children}
    </ScrollView>
  );
});

/** Shared label grouping so fields never invent their own vertical spacing. */
export function OrdiloFormField({
  children,
  error,
  helper,
  label,
  style,
}: {
  children: ReactNode;
  error?: string;
  helper?: string;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.formField, style]}>
      <Text style={styles.formFieldLabel}>{label}</Text>
      {children}
      {error ? (
        <Text accessibilityRole="alert" style={styles.formFieldError}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={styles.formFieldHelper}>{helper}</Text>
      ) : null}
    </View>
  );
}

/**
 * Standard form control with one border, one focus treatment and optional
 * leading/trailing accessories. Multiline inputs use the same shell.
 */
export function OrdiloFormInput({
  containerStyle,
  leading,
  multiline = false,
  invalid = false,
  onBlur,
  onFocus,
  placeholderTextColor = colors.mistDark,
  style,
  trailing,
  ...props
}: TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
  leading?: ReactNode;
  invalid?: boolean;
  trailing?: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.formControl,
        multiline && styles.formControlMultiline,
        focused && styles.formControlFocused,
        invalid && styles.formControlInvalid,
        containerStyle,
      ]}
    >
      {leading}
      <TextInput
        {...props}
        aria-invalid={invalid}
        multiline={multiline}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={placeholderTextColor}
        style={[
          styles.formControlInput,
          multiline && styles.formControlInputMultiline,
          style,
        ]}
      />
      {trailing}
    </View>
  );
}

/** Shared tappable control for picker-backed fields. */
export function OrdiloFormSelect({
  accessibilityHint,
  accessibilityLabel,
  disabled = false,
  leading,
  onPress,
  trailing,
  value,
}: {
  accessibilityHint?: string;
  accessibilityLabel: string;
  disabled?: boolean;
  leading?: ReactNode;
  onPress: () => void;
  trailing?: ReactNode;
  value: string;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.formControl,
        styles.formSelect,
        pressed && styles.formControlPressed,
        disabled && styles.formControlDisabled,
      ]}
    >
      {leading}
      <Text style={styles.formSelectValue}>{value}</Text>
      {trailing}
    </Pressable>
  );
}

/** Pinned action area shared by all form sheets. */
export function OrdiloFormFooter({
  after,
  error,
  primary,
  secondary,
}: {
  after?: ReactNode;
  error?: string | null;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <View style={styles.formFooter}>
      {error ? (
        <View accessibilityRole="alert" style={styles.formError}>
          <Text style={styles.formErrorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.formActions}>
        {secondary ? <View style={styles.formAction}>{secondary}</View> : null}
        <View style={styles.formAction}>{primary}</View>
      </View>
      {after}
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.warmWhite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  detachedBackground: {
    borderBottomLeftRadius: FLOATING_SHEET_BOTTOM_RADIUS,
    borderBottomRightRadius: FLOATING_SHEET_BOTTOM_RADIUS,
  },
  detachedSheet: {
    marginHorizontal: FLOATING_SHEET_INSET,
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
    // paddingBottom comes from the slotBottomInset above (safe-area aware).
    paddingHorizontal: FLOATING_SHEET_INSET,
  },
  modalSheet: {
    backgroundColor: colors.warmWhite,
    borderBottomLeftRadius: FLOATING_SHEET_BOTTOM_RADIUS,
    borderBottomRightRadius: FLOATING_SHEET_BOTTOM_RADIUS,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "88%",
    overflow: "hidden",
  },
  formSheetPadding: {
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  floatingHandle: {
    alignSelf: "center",
    backgroundColor: colors.mistLight,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    width: 40,
  },
  sheetHeader: {
    minHeight: 112,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  sheetHeaderCopy: {
    gap: spacing.xs,
    paddingRight: 82,
    zIndex: 1,
  },
  sheetHeaderCopyWithClose: { paddingRight: 128 },
  sheetHeaderTitle: {
    color: colors.harborBlueDarker,
    ...typography.display,
    fontSize: 21,
    lineHeight: 27,
  },
  sheetHeaderSubtitle: { color: colors.mistDark, ...typography.timestamp },
  sheetHeaderDecoration: {
    alignItems: "center",
    height: 72,
    justifyContent: "center",
    position: "absolute",
    right: spacing.sm,
    top: 0,
    width: 72,
  },
  sheetHeaderDecorationWithClose: { right: 48 },
  sheetHeaderWash: {
    backgroundColor: colors.washApricot,
    borderRadius: radii.pill,
    height: 66,
    opacity: 0.7,
    position: "absolute",
    right: -22,
    top: 5,
    width: 66,
  },
  sheetHeaderDot: {
    backgroundColor: colors.warmApricotLight,
    borderRadius: radii.pill,
    bottom: 8,
    height: 9,
    left: 5,
    position: "absolute",
    width: 9,
  },
  sheetHeaderClose: {
    alignItems: "center",
    backgroundColor: colors.sand,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    top: 0,
    width: 36,
    zIndex: 2,
  },
  nestedOverlay: {
    backgroundColor: "rgba(38, 36, 33, 0.28)",
    bottom: 0,
    elevation: 20,
    justifyContent: "flex-end",
    left: 0,
    padding: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 20,
  },
  nestedPanel: {
    backgroundColor: colors.warmWhite,
    borderBottomLeftRadius: FLOATING_SHEET_BOTTOM_RADIUS,
    borderBottomRightRadius: FLOATING_SHEET_BOTTOM_RADIUS,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "88%",
    overflow: "hidden",
  },
  formBody: { flexShrink: 1 },
  formBodyContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.md,
  },
  formField: { gap: spacing.xs },
  formFieldLabel: { color: colors.mistDark, ...typography.label },
  formFieldHelper: { color: colors.mistDark, ...typography.label },
  formFieldError: { color: colors.destructive, ...typography.label },
  formControl: {
    alignItems: "center",
    backgroundColor: colors.warmWhite,
    borderColor: colors.mistLight,
    borderRadius: radii.base,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  formControlFocused: {
    borderColor: colors.harborBlue,
    borderWidth: 2,
  },
  formControlInvalid: {
    borderColor: colors.destructive,
    borderWidth: 2,
  },
  formControlPressed: { backgroundColor: colors.sandWarm },
  formControlDisabled: { opacity: 0.5 },
  formControlMultiline: {
    alignItems: "flex-start",
    minHeight: 112,
  },
  formControlInput: {
    color: colors.graphite,
    flex: 1,
    minHeight: 46,
    paddingVertical: 0,
    ...typography.body,
  },
  formControlInputMultiline: {
    minHeight: 110,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  formSelect: { width: "100%" },
  formSelectValue: {
    color: colors.graphite,
    flex: 1,
    ...typography.body,
  },
  formFooter: {
    backgroundColor: colors.warmWhite,
    borderTopColor: colors.mistLight,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  formActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  formAction: { flex: 1 },
  formError: {
    backgroundColor: colors.destructiveBackground,
    borderColor: colors.destructive,
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.sm,
  },
  formErrorText: { color: colors.destructive, ...typography.timestamp },
});
