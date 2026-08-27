/**
 * Motion tokens for the native app — the movement vocabulary of the
 * Family Journal. DESIGN.md allows state transitions (150–250ms) and
 * brief, contextual brand moments; it forbids decorative motion that
 * conveys no state. Everything here is either a state transition
 * (list changes, press feedback, panels) or a calm loading signal
 * (skeleton pulse).
 *
 * Positional presets honour Reduce Motion; opacity-only transitions
 * remain because they preserve state continuity without movement.
 */
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  type BaseAnimationBuilder,
} from "react-native-reanimated";

/** Durations in ms. Frequent feedback stays under 150ms. */
export const durations = {
  fast: 150,
  base: 220,
} as const;

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** Canonical system setting for animation builders that accept it. */
export const REDUCE_MOTION = ReduceMotion.System;

/** Near-imperceptible feedback for controls used many times a day. */
export const pressScale = 0.97;
export const pressDuration = 120;

export type StepDirection = "forward" | "backward";

/** Native forms travel only when the system allows positional motion. */
export function modalAnimationType(
  reduceMotion: boolean,
): "fade" | "slide" {
  return reduceMotion ? "fade" : "slide";
}

/** Siblings glide into their new places when a row enters or leaves. */
export function listLayout(): BaseAnimationBuilder {
  return LinearTransition.duration(durations.base)
    .easing(EASE_IN_OUT)
    .reduceMotion(REDUCE_MOTION);
}

/** Quiet cross-fade for an occasional in-place content state change. */
export function contentEntering(): BaseAnimationBuilder {
  return FadeIn.duration(durations.base)
    .easing(EASE_OUT)
    .reduceMotion(ReduceMotion.Never);
}

/**
 * Rare, meaningful multi-step flows use 12px of direction to explain
 * progress. Reduce Motion keeps the state continuity but drops travel.
 */
export function stepEntering(
  direction: StepDirection,
  reduceMotion: boolean,
): BaseAnimationBuilder {
  if (reduceMotion) {
    return FadeIn.duration(durations.fast)
      .easing(EASE_OUT)
      .reduceMotion(ReduceMotion.Never);
  }

  const entering = direction === "forward" ? FadeInRight : FadeInLeft;
  return entering
    .duration(durations.base)
    .withInitialValues({
      opacity: 0,
      transform: [
        { translateX: direction === "forward" ? 12 : -12 },
      ],
    })
    .easing(EASE_OUT);
}

/** Step exits never travel, so outgoing and incoming content do not cross. */
export function stepExiting(): BaseAnimationBuilder {
  return FadeOut.duration(durations.fast)
    .easing(EASE_OUT)
    .reduceMotion(ReduceMotion.Never);
}

/** A transient feedback banner rises only 8px, then leaves more quickly. */
export function feedbackEntering(
  reduceMotion = false,
): BaseAnimationBuilder {
  if (reduceMotion) {
    return FadeIn.duration(durations.fast)
      .easing(EASE_OUT)
      .reduceMotion(ReduceMotion.Never);
  }
  return FadeInDown.duration(durations.base)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
    .easing(EASE_OUT);
}

export function feedbackExiting(): BaseAnimationBuilder {
  return FadeOut.duration(durations.fast)
    .easing(EASE_OUT)
    .reduceMotion(ReduceMotion.Never);
}
