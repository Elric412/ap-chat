import { describe, expect, it } from 'vitest';
import { uuidv7 } from '@/lib/uuid';

describe('uuidv7', () => {
  it('returns UUID with v7 version and RFC variant bits', () => {
    const value = uuidv7();
    const parts = value.split('-');

    expect(parts).toHaveLength(5);
    expect(parts[2][0]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(parts[3][0]);
  });
});
