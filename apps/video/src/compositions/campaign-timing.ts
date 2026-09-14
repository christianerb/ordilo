export const CAMPAIGN_TIMING = {
  social: [0, 75, 165, 255, 375, 510, 600],
  homepage: [0, 105, 255, 390, 570, 780, 900],
} as const;

export function sceneIntervals(wide: boolean) {
  const times = wide ? CAMPAIGN_TIMING.homepage : CAMPAIGN_TIMING.social;
  return times.slice(0, -1).map((from, index) => ({
    from,
    duration: times[index + 1] - from,
    mountedDuration: times[index + 1] - from + (index === times.length - 2 ? 0 : 10),
  }));
}
