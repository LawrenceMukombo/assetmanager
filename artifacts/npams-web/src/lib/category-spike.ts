// Centralised "consumption spike" detection for stock category cards.
//
// A category is flagged as spiking when its current-window burn rate is
// materially higher than the equally-sized previous window. We require BOTH:
//   1. A minimum absolute increase in current burn (so a jump from 1 → 3 units
//      doesn't dominate the dashboard), AND
//   2. A percentage increase above SPIKE_PCT_THRESHOLD.
//
// Categories that just started moving (prev === 0 but cur >= MIN_NEW_ACTIVITY)
// also count as spiking, since "new activity" is the most extreme form of
// week-on-week increase.
//
// Tune these constants in one place to adjust how aggressive the highlight is.

export const SPIKE_PCT_THRESHOLD = 50;
export const SPIKE_MIN_CURRENT = 5;
export const SPIKE_MIN_NEW_ACTIVITY = 5;

export function isCategorySpiking(cur: number, prev: number): boolean {
  if (cur < SPIKE_MIN_CURRENT) return false;
  if (prev === 0) return cur >= SPIKE_MIN_NEW_ACTIVITY;
  const pct = ((cur - prev) / prev) * 100;
  return pct >= SPIKE_PCT_THRESHOLD;
}
