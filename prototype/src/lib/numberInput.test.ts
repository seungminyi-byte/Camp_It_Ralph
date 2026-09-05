import { describe, expect, it } from 'vitest';
import { clampRound, formatNumber, parseAmount } from './numberInput';

describe('parseAmount', () => {
  it('reads plain and thousands-separated numbers, ignoring stray units', () => {
    expect(parseAmount('5,000')).toBe(5000);
    expect(parseAmount(' 5.5 ')).toBe(5.5);
    expect(parseAmount('5.5%')).toBe(5.5);
    expect(parseAmount('3000원')).toBe(3000);
  });

  it('reads 조/억 suffixes only when allowed', () => {
    expect(parseAmount('1.5조', { koreanUnits: true })).toBe(15000);
    expect(parameters('3000억원')).toBe(3000);
    expect(parseAmount('1.5조')).toBeNull();
  });

  it('rejects text that is not a number', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1,2,3원 이상')).toBeNull();
  });
});

function parameters(text: string): number | null {
  return parseAmount(text, { koreanUnits: true });
}

describe('clampRound', () => {
  it('clamps to the range and rounds to the requested decimals', () => {
    expect(clampRound(50, 100, 100000, 0)).toBe(100);
    expect(clampRound(1e9, 100, 100000, 0)).toBe(100000);
    expect(clampRound(1234.5, 100, 100000, 0)).toBe(1235);
    expect(clampRound(5.26, 1, 20, 1)).toBe(5.3);
    expect(clampRound(5.24, 1, 20, 1)).toBe(5.2);
  });
});

describe('formatNumber', () => {
  it('groups thousands and pads decimals', () => {
    expect(formatNumber(5000, 0)).toBe('5,000');
    expect(formatNumber(5.5, 1)).toBe('5.5');
    expect(formatNumber(5, 1)).toBe('5.0');
  });
});
