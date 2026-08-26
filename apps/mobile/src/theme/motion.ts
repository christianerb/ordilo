/**
 * Motion tokens for the native app — the movement vocabulary of the
 * Family Journal. DESIGN.md allows state transitions (150–250ms) and
 * brief, contextual brand moments; it forbids decorative motion that
 * conveys no state. Everything here is either a state transition
 * (list changes, press feedback, panels) or a calm loading signal
 * (skeleton pulse).
 *
 * All presets honour the system reduce-motion setting via
 * ReduceMotion.System, so `useReducedMotion` checks are only needed
 * for hand-rolled loops (e.g. the thinking dots in the chat).
 */
import {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  ReduceMotion,
  type BaseAnimationBuilder,
} from "react-native-reanimated";

/** Durations in ms. State transitions live in the 150–250ms band. */
export const durations = {
  fast: 150,
  base: 220,
  slow: 320,
} as const;

/**
 * Spring configs for `withSpring`.
 *
 * - `press`: tactile scale feedback (0.97) — quick with a hint of bounce.
 * - `panel`: sheet/panel travel — matches the document-detail gesture
 *   (duration 300, dampingRatio 0.8) so every moving surface feels the same.
 */
export const springs = {
  press: { damping: 15, stiffness: 420, mass: 0.5 },
  panel: { duration: 300, dampingRatio: 0.8 },
} as const;

/** Press scale used by SpringPressable and interactive cards. */
export const pressScale = 0.97;

/**
 * Stagger for grouped entrances (chat sources, list rows). Capped so a
 * long list never delays its tail by more than ~300ms.
 */
export function staggerDelay(index: number, step = 40): number {
  return Math.min(index, 8) * step;
}

/** A row fading in and rising 8px — the default list entrance. */
export function listItemEntering(index = 0, step = 40): BaseAnimationBuilder {
  return FadeInDown.duration(durations.base)
    .delay(staggerDelay(index, step))
    .reduceMotion(ReduceMotion.System);
}

/** A row collapsing upward when it leaves (task completed, item deleted). */
export function listItemExiting(): BaseAnimationBuilder {
  return FadeOutUp.duration(durations.fast).reduceMotion(ReduceMotion.System);
}

/** Siblings glide into their new places when a row enters or leaves. */
export function listLayout(): BaseAnimationBuilder {
  return LinearTransition.duration(durations.base).reduceMotion(
    ReduceMotion.System,
  );
}

/** Quiet cross-fades for swapped content (loading → data, tab states). */
export function contentEntering(): BaseAnimationBuilder {
  return FadeIn.duration(durations.base).reduceMotion(ReduceMotion.System);
}

export function contentExiting(): BaseAnimationBuilder {
  return FadeOut.duration(durations.fast).reduceMotion(ReduceMotion.System);
}
