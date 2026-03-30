/**
 * utils.ts — pure, browser-free utility functions (shared by DSP and popup)
 */

export interface StereoGains {
  ll: number; // L → L_out
  rl: number; // R → L_out
  lr: number; // L → R_out
  rr: number; // R → R_out
}

/**
 * Compute mid-side stereo widener gain coefficients.
 *   w = 0  → mono   (ll=rl=lr=rr=0.5)
 *   w = 1  → normal (ll=rr=1, rl=lr=0)
 *   w = 2  → wide   (ll=rr=1.5, rl=lr=-0.5)
 */
export function stereoGains(w: number): StereoGains {
  return {
    ll: (1 + w) / 2,
    rl: (1 - w) / 2,
    lr: (1 - w) / 2,
    rr: (1 + w) / 2,
  };
}

/** Format a 0–1 master gain as a percentage string e.g. "75%". */
export function formatVolume(v: number): string {
  return Math.round(v * 100) + '%';
}

/**
 * Format a stereo width value (0–2) for display.
 *   < 0.95 → "50%"   (narrow)
 *   > 1.05 → "+50%"  (wide)
 *   else   → "Normal"
 */
export function formatStereoWidth(v: number): string {
  if (v < 0.95) return Math.round(v * 100) + '%';
  if (v > 1.05) return '+' + Math.round((v - 1) * 100) + '%';
  return 'Normal';
}
