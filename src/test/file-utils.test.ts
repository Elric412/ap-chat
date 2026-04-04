import { describe, expect, it } from 'vitest';
import { toSafeFilename } from '../lib/file-utils';

describe('toSafeFilename', () => {
  it('sanitizes punctuation, separators, and spacing', () => {
    expect(toSafeFilename('  Quarterly / Growth: Q1*2026?  ')).toBe('Quarterly-Growth-Q1-2026');
  });

  it('normalizes accented characters', () => {
    expect(toSafeFilename('Résumé de l\'année')).toBe('Resume-de-l-annee');
  });

  it('falls back for empty or fully invalid names', () => {
    expect(toSafeFilename('')).toBe('conversation');
    expect(toSafeFilename('///:::***')).toBe('conversation');
  });

  it('avoids reserved windows device names', () => {
    expect(toSafeFilename('con')).toBe('con-file');
    expect(toSafeFilename('LPT1')).toBe('LPT1-file');
  });

  it('enforces max basename length', () => {
    const longTitle = 'a'.repeat(200);
    expect(toSafeFilename(longTitle).length).toBeLessThanOrEqual(80);
  });
});
