import { describe, it, expect } from 'vitest';
import { cleanHighlights, extractHighlightsFromProfileJson } from './highlights';

describe('cleanHighlights', () => {
  it('returns [] for non-array input', () => {
    expect(cleanHighlights(null)).toEqual([]);
    expect(cleanHighlights(undefined)).toEqual([]);
    expect(cleanHighlights('a string')).toEqual([]);
    expect(cleanHighlights({ x: 1 })).toEqual([]);
  });

  it('drops short fragments below 30 chars', () => {
    expect(cleanHighlights(['too short', 'A reasonable sentence about finance leadership work.'])).toEqual([
      'A reasonable sentence about finance leadership work.',
    ]);
  });

  it("splits on Exa's [...] disjoint-excerpt marker", () => {
    const raw = [
      'Senior BDR at Moss-Stop manual work and start mastering your spend. [...] I help finance teams gain control over company spending with Moss.',
    ];
    const out = cleanHighlights(raw);
    expect(out.length).toBe(2);
    expect(out[0]).toContain('Senior BDR at Moss');
    expect(out[1]).toContain('finance teams gain control');
    expect(out.every((s) => !s.includes('[...]'))).toBe(true);
  });

  it('strips markdown link syntax, keeping only the label', () => {
    const raw = ['Senior BDR at [Moss](https://www.linkedin.com/company/getvanta) in Amsterdam, focused on finance.'];
    expect(cleanHighlights(raw)[0]).toBe('Senior BDR at Moss in Amsterdam, focused on finance.');
  });

  it('strips leading header marker hashes', () => {
    const raw = ['### Senior BDR at Moss focused on outbound sales in the Dutch market.'];
    expect(cleanHighlights(raw)[0]).not.toMatch(/^#/);
    expect(cleanHighlights(raw)[0]).toContain('Senior BDR at Moss');
  });

  it('collapses runs of whitespace and newlines', () => {
    const raw = ['Senior   BDR   at\n\nMoss\t\tin\nAmsterdam, focused on finance work.'];
    expect(cleanHighlights(raw)[0]).toBe('Senior BDR at Moss in Amsterdam, focused on finance work.');
  });

  it('dedupes identical pieces across input strings', () => {
    const raw = [
      'A reasonable sentence about finance leadership work.',
      'A reasonable sentence about finance leadership work.',
    ];
    expect(cleanHighlights(raw)).toEqual([
      'A reasonable sentence about finance leadership work.',
    ]);
  });

  it('caps at 3 pieces total', () => {
    const long = (n: number) => `Sentence number ${n} about finance leadership work and operational excellence.`;
    const raw = [long(1), long(2), long(3), long(4), long(5)];
    expect(cleanHighlights(raw).length).toBe(3);
  });

  it('truncates very long pieces at sentence boundary', () => {
    const long =
      'First sentence about finance and the team. ' +
      'Second sentence describes the role and responsibilities in detail at the company. ' +
      'Third sentence which goes on and on and on with more details about what they do day to day.' +
      ' Fourth sentence trailing off into more detail';
    const out = cleanHighlights([long]);
    expect(out[0].length).toBeLessThanOrEqual(241);
    // Should end at a `. ` boundary, not mid-word.
    expect(out[0]).toMatch(/\.$|…$/);
  });

  it('truncates with ellipsis when no sentence boundary nearby', () => {
    const long = 'a'.repeat(300);
    const out = cleanHighlights([long]);
    expect(out[0].endsWith('…')).toBe(true);
  });
});

describe('extractHighlightsFromProfileJson', () => {
  it('handles null / non-object profile_json', () => {
    expect(extractHighlightsFromProfileJson(null)).toEqual([]);
    expect(extractHighlightsFromProfileJson(undefined)).toEqual([]);
    expect(extractHighlightsFromProfileJson(42)).toEqual([]);
  });

  it('reads .highlights array off the profile json', () => {
    const profile = {
      highlights: [
        'A clean, reasonable-length excerpt from the candidate profile.',
      ],
      otherStuff: 'ignored',
    };
    expect(extractHighlightsFromProfileJson(profile)).toEqual([
      'A clean, reasonable-length excerpt from the candidate profile.',
    ]);
  });

  it('returns [] when .highlights is missing or wrong type', () => {
    expect(extractHighlightsFromProfileJson({})).toEqual([]);
    expect(extractHighlightsFromProfileJson({ highlights: 'not-an-array' })).toEqual([]);
    expect(extractHighlightsFromProfileJson({ highlights: 5 })).toEqual([]);
  });
});
