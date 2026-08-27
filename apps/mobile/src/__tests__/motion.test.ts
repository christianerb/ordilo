import {
  durations,
  contentEntering,
  feedbackEntering,
  feedbackExiting,
  modalAnimationType,
  pressDuration,
  pressScale,
  REDUCE_MOTION,
  stepEntering,
  stepExiting,
} from "../theme/motion";

// The animation builders themselves are not exercised here — only the
// pure tokens — so Reanimated's native runtime is stubbed out.
jest.mock("react-native-reanimated", () => {
  const makeMockBuilder = (name: string) => {
    const builder: {
      name: string;
      duration?: jest.Mock;
      easing?: jest.Mock;
      reduceMotion?: jest.Mock;
      withInitialValues?: jest.Mock;
    } = { name };
    builder.duration = jest.fn(() => builder);
    builder.easing = jest.fn(() => builder);
    builder.reduceMotion = jest.fn(() => builder);
    builder.withInitialValues = jest.fn(() => builder);
    return builder;
  };

  return {
    FadeIn: makeMockBuilder("fade"),
    FadeInDown: makeMockBuilder("down"),
    FadeInLeft: makeMockBuilder("left"),
    FadeInRight: makeMockBuilder("right"),
    FadeOut: makeMockBuilder("out"),
    LinearTransition: makeMockBuilder("linear"),
    ReduceMotion: { Never: "never", System: "system" },
    Easing: {
      bezier: jest.fn(() => "ease"),
    },
  };
});

/**
 * Motion tokens are the guardrails of DESIGN.md's animation rules.
 * These tests pin the pure contract without touching Reanimated.
 */
describe("motion tokens", () => {
  it("keeps state transitions inside the 150–250ms band", () => {
    expect(durations.fast).toBeGreaterThanOrEqual(150);
    expect(durations.base).toBeLessThanOrEqual(250);
    expect(durations.fast).toBeLessThan(durations.base);
  });

  it("keeps frequent press feedback subtle and fast", () => {
    expect(pressDuration).toBeGreaterThanOrEqual(100);
    expect(pressDuration).toBeLessThanOrEqual(150);
    expect(pressScale).toBeGreaterThan(0.95);
    expect(pressScale).toBeLessThan(1);
  });

  it("uses one system Reduce Motion token and fades native modals", () => {
    expect(REDUCE_MOTION).toBe("system");
    expect(modalAnimationType(false)).toBe("slide");
    expect(modalAnimationType(true)).toBe("fade");
  });

  it("selects directional step entries and opacity-only reduced motion", () => {
    const forward = stepEntering("forward", false) as unknown as {
      name: string;
      duration: jest.Mock;
      withInitialValues: jest.Mock;
    };
    expect(forward.name).toBe("right");
    expect(forward.duration).toHaveBeenLastCalledWith(220);
    expect(forward.withInitialValues).toHaveBeenLastCalledWith({
      opacity: 0,
      transform: [{ translateX: 12 }],
    });
    expect(
      (forward as typeof forward & { reduceMotion: jest.Mock }).reduceMotion,
    ).not.toHaveBeenCalled();

    const backward = stepEntering("backward", false) as unknown as {
      name: string;
      duration: jest.Mock;
      withInitialValues: jest.Mock;
    };
    expect(backward.name).toBe("left");
    expect(backward.duration).toHaveBeenLastCalledWith(220);
    expect(backward.withInitialValues).toHaveBeenLastCalledWith({
      opacity: 0,
      transform: [{ translateX: -12 }],
    });
    expect(
      (backward as typeof backward & { reduceMotion: jest.Mock }).reduceMotion,
    ).not.toHaveBeenCalled();

    const reduced = stepEntering("forward", true) as unknown as {
      name: string;
      reduceMotion: jest.Mock;
    };
    expect(reduced.name).toBe("fade");
    expect(reduced.reduceMotion).toHaveBeenLastCalledWith("never");
    const exiting = stepExiting() as unknown as {
      name: string;
      duration: jest.Mock;
      reduceMotion: jest.Mock;
    };
    expect(exiting.name).toBe("out");
    expect(exiting.duration).toHaveBeenLastCalledWith(150);
    expect(exiting.reduceMotion).toHaveBeenLastCalledWith("never");
  });

  it("keeps opacity-only continuity under system Reduce Motion", () => {
    const content = contentEntering() as unknown as {
      reduceMotion: jest.Mock;
    };
    const reducedFeedback = feedbackEntering(true) as unknown as {
      reduceMotion: jest.Mock;
    };
    const feedbackExit = feedbackExiting() as unknown as {
      reduceMotion: jest.Mock;
    };

    expect(content.reduceMotion).toHaveBeenLastCalledWith("never");
    expect(reducedFeedback.reduceMotion).toHaveBeenLastCalledWith("never");
    expect(feedbackExit.reduceMotion).toHaveBeenLastCalledWith("never");

    const positionalFeedback = feedbackEntering(false) as unknown as {
      reduceMotion: jest.Mock;
    };
    expect(positionalFeedback.reduceMotion).not.toHaveBeenCalled();
  });
});
