import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";

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
  const reduceMotion = useReducedMotion();

  return (
    <Modal
      animationType={reduceMotion ? "fade" : "slide"}
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.formOverlay}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[styles.formSheet, style]}
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
        </Pressable>
      </Pressable>
    </Modal>
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
  formOverlay: {
    backgroundColor: "rgba(38, 36, 33, 0.28)",
    flex: 1,
    justifyContent: "flex-end",
  },
  formSheet: {
    backgroundColor: colors.warmWhite,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "88%",
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
