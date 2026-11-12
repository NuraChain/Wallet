import { describe, expect, it } from 'vitest';

import { groupDigits, latinDigits, trimAmount } from '../utility/format';

describe('groupDigits', () => {
    it('separates every three digits of the whole part', () => {
        expect(groupDigits('1234567')).toBe('1,234,567');
        expect(groupDigits('1234.56789')).toBe('1,234.56789');
        expect(groupDigits('-1000 ETH')).toBe('-1,000 ETH');
        expect(groupDigits('999')).toBe('999');
    });
});

describe('trimAmount', () => {
    it('trims the fraction and groups the whole part', () => {
        expect(trimAmount('1234567.12345678')).toBe('1,234,567.123456');
        expect(trimAmount('25000.000')).toBe('25,000');
        expect(trimAmount('0.5')).toBe('0.5');
    });
});

describe('latinDigits', () => {
    it('reads Persian and Arabic digits and the Arabic decimal mark', () => {
        expect(latinDigits('۵۰۰۰۰')).toBe('50000');
        expect(latinDigits('٢٫٥')).toBe('2.5');
    });

    it('leaves Latin input alone', () => {
        expect(latinDigits('2.5')).toBe('2.5');
    });
});
