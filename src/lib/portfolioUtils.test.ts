import { describe, it, expect } from 'vitest';
import { monthsBetween } from './portfolioUtils';

describe('monthsBetween', () => {
  it('returns 0 for identical dates', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-01');
    expect(monthsBetween(start, end)).toBe(0);
  });

  it('handles multiple months', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-04-01');
    expect(monthsBetween(start, end)).toBeCloseTo(3, 1);
  });

  it('handles dates within the same month', () => {
    const start = new Date('2024-05-01');
    const end = new Date('2024-05-20');
    const diff = monthsBetween(start, end);
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThan(1);
  });

  it('handles partial months across boundaries', () => {
    const start = new Date('2024-01-15');
    const end = new Date('2024-04-10');
    expect(monthsBetween(start, end)).toBeCloseTo(2.8, 1);
  });
});
