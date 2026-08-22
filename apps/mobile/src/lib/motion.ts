import { ReduceMotion } from "react-native-reanimated";

/**
 * Motion vocabulary for the native app.
 *
 * Motion is short, springy, and always interruptible. Every animation
 * declared with these tokens must pass `reduceMotion: REDUCE_MOTION` so
 * the system's Reduce Motion setting turns movement into a simple fade
 * (DESIGN.md: animations need instant alternatives).
 */

/** Passed to every withSpring/withTiming so iOS Reduce Motion wins. */
export const REDUCE_MOTION = ReduceMotion.System;

export const motion = {
  duration: {
    /** Micro feedback — toggles, presses. */
    fast: 150,
    /** State transitions — panels, badges, list changes. */
    base: 220,
    /** Brand moments — entrances, success states. */
    slow: 340,
  },
  spring: {
    /** Buttons and rows: quick, barely overshooting. */
    snappy: {
      damping: 20,
      stiffness: 320,
      mass: 0.7,
      reduceMotion: REDUCE_MOTION,
    },
    /** Entrances and sheets: soft, a hint of warmth. */
    gentle: {
      damping: 17,
      stiffness: 160,
      mass: 0.9,
      reduceMotion: REDUCE_MOTION,
    },
    /** Celebrations: a visible, friendly bounce. */
    bouncy: {
      damping: 12,
      stiffness: 190,
      mass: 0.8,
      reduceMotion: REDUCE_MOTION,
    },
  },
} as const;

/**
 * Staggered entrance delay for grouped content (settings sections,
 * onboarding steps). Capped so late items never feel forgotten.
 */
export function staggerDelay(index: number, step = 70, max = 420): number {
  return Math.min(index * step, max);
}
