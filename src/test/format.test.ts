import { describe, expect, it } from 'vitest';

import { latinDigits } from '../utility/format';

describe('latinDigits', () => {
    it('reads Persian and Arabic digits and the Arabic decimal mark', () => {
        expect(latinDigits('۵۰۰۰۰')).toBe('50000');
        expect(latinDigits('٢٫٥')).toBe('2.5');
    });

    it('leaves Latin input alone', () => {
        expect(latinDigits('2.5')).toBe('2.5');
    });
});
