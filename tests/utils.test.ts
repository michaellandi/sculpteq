import { stereoGains, formatVolume, formatStereoWidth } from '../src/utils';

// ---------------------------------------------------------------------------
// stereoGains
// ---------------------------------------------------------------------------

describe('stereoGains', () => {
  it('returns identity matrix at w=1 (normal stereo)', () => {
    const g = stereoGains(1);
    expect(g.ll).toBe(1);
    expect(g.rl).toBe(0);
    expect(g.lr).toBe(0);
    expect(g.rr).toBe(1);
  });

  it('returns equal mix at w=0 (mono)', () => {
    const g = stereoGains(0);
    expect(g.ll).toBe(0.5);
    expect(g.rl).toBe(0.5);
    expect(g.lr).toBe(0.5);
    expect(g.rr).toBe(0.5);
  });

  it('exaggerates channels at w=2 (wide)', () => {
    const g = stereoGains(2);
    expect(g.ll).toBe(1.5);
    expect(g.rl).toBe(-0.5);
    expect(g.lr).toBe(-0.5);
    expect(g.rr).toBe(1.5);
  });

  it('ll always equals rr (symmetric)', () => {
    [0, 0.5, 1, 1.5, 2].forEach((w) => {
      const g = stereoGains(w);
      expect(g.ll).toBe(g.rr);
      expect(g.rl).toBe(g.lr);
    });
  });

  it('rl+ll sums to 1 (output power preserved)', () => {
    [0, 0.5, 1, 1.5, 2].forEach((w) => {
      const g = stereoGains(w);
      expect(g.ll + g.rl).toBeCloseTo(1);
    });
  });
});

// ---------------------------------------------------------------------------
// formatVolume
// ---------------------------------------------------------------------------

describe('formatVolume', () => {
  it('formats 1.0 as 100%', () => expect(formatVolume(1.0)).toBe('100%'));
  it('formats 0.5 as 50%',  () => expect(formatVolume(0.5)).toBe('50%'));
  it('formats 0.0 as 0%',   () => expect(formatVolume(0)).toBe('0%'));
  it('rounds fractional values', () => expect(formatVolume(0.756)).toBe('76%'));
});

// ---------------------------------------------------------------------------
// formatStereoWidth
// ---------------------------------------------------------------------------

describe('formatStereoWidth', () => {
  it('returns Normal at w=1',                () => expect(formatStereoWidth(1)).toBe('Normal'));
  it('returns Normal within ±0.05 of 1',     () => {
    expect(formatStereoWidth(0.95)).toBe('Normal');
    expect(formatStereoWidth(1.05)).toBe('Normal');
  });
  it('returns percentage for narrow values', () => expect(formatStereoWidth(0.5)).toBe('50%'));
  it('returns +percentage for wide values',  () => expect(formatStereoWidth(1.5)).toBe('+50%'));
  it('treats values just below 0.95 as narrow', () => expect(formatStereoWidth(0.94)).toBe('94%'));
  it('treats values just above 1.05 as wide',   () => expect(formatStereoWidth(1.06)).toBe('+6%'));
});
