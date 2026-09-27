/**
 * NutriPack — engine utilities.
 * All functions are pure and unit-testable. Values produced here are model
 * estimates, never presented as experimental measurements.
 */

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Score 1 inside [min,max], halving per decade outside (order-of-magnitude decay). */
export function windowScore(value: number, min: number, max: number): number {
  if (value >= min && value <= max) return 1;
  const dist = value < min ? min - value : value - max;
  const scale = Math.max(Math.abs(min), Math.abs(max), 1);
  return clamp(Math.pow(10, -dist / scale / Math.log(100)) * 0.999, 0.02, 1);
}

/** Lower-is-better score with a soft target (e.g., permeability barriers). */
export function lowerIsBetterScore(value: number, requirement: number, tolerance = 3): number {
  if (value <= requirement) return 1;
  return clamp(1 - Math.log10(value / requirement) / Math.log10(tolerance), 0.02, 1);
}

/** Higher-is-better score with a soft requirement. */
export function higherIsBetterScore(value: number, requirement: number, tolerance = 3): number {
  if (value >= requirement) return 1;
  return clamp(1 - Math.log10(requirement / Math.max(value, 1e-9)) / Math.log10(tolerance), 0.02, 1);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

export const round = (v: number, digits = 2) => {
  const p = Math.pow(10, digits);
  return Math.round(v * p) / p;
};

/** Logistic Q10-style relative rate: rate multiplies by Q10 per 10°C. */
export function q10(baseTempC: number, actualTempC: number, q10Factor: number): number {
  return Math.pow(q10Factor, (actualTempC - baseTempC) / 10);
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const inRange = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;
