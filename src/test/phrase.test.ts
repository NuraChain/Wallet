import { Mnemonic } from 'ethers';
import { describe, expect, it } from 'vitest';

import { enterPhrase, phraseWords, resizePhrase } from '../core/phrase';

/** BIP-39's own vectors for all-zero entropy: the 128-bit phrase and the 256-bit one. */
const twelve = [...Array.from({ length: 11 }, () => 'abandon'), 'about'];
const twentyFour = [...Array.from({ length: 23 }, () => 'abandon'), 'art'];

/** BIP-39's 256-bit vector for `7f7f…7f`, whose two halves are told apart by their words. */
const legal =
    'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title'.split(
        ' '
    );

const empty = (length: number) => Array.from({ length }, () => '');

/** The phrase dialog's text export: one numbered word a line. */
const exported = (words: string[]) => words.map((word, index) => `${index + 1}. ${word}`).join('\n');

describe('the words of a phrase', () => {
    it('splits at spaces, line breaks and commas', () => {
        expect(phraseWords('  abandon\tability\r\nable,about ,  above ')).toEqual(['abandon', 'ability', 'able', 'about', 'above']);
    });

    it('lower-cases the word a phone capitalized', () => {
        expect(phraseWords('Abandon ABILITY')).toEqual(['abandon', 'ability']);
    });

    it("reads the wallet's own text export back as the phrase it was made from", () => {
        expect(phraseWords(exported(twelve))).toEqual(twelve);
        expect(phraseWords(exported(twentyFour))).toEqual(twentyFour);
    });

    it('leaves out the numbers of a copy written down in other ways', () => {
        expect(phraseWords('1) abandon 2) ability 3.able 4 about 5- above')).toEqual(['abandon', 'ability', 'able', 'about', 'above']);
    });

    it('is nothing for nothing', () => {
        expect(phraseWords('')).toEqual([]);
        expect(phraseWords(' \n ')).toEqual([]);
    });
});

describe('the boxes at a new length', () => {
    it('keeps every word when they grow', () => {
        const words = twelve.with(11, '');

        expect(resizePhrase(words, 24)).toEqual([...words, ...empty(12)]);
    });

    it('keeps the words when the boxes that go are empty', () => {
        expect(resizePhrase([...twelve, ...empty(12)], 12)).toEqual(twelve);
    });

    it('never cuts a longer phrase down to its first twelve words', () => {
        expect(resizePhrase(twentyFour, 12)).toEqual(empty(12));
        expect(resizePhrase([...twelve, 'abandon', ...empty(11)], 12)).toEqual(empty(12));
    });
});

describe('a word typed or pasted into a box', () => {
    it('puts one word in that box alone', () => {
        expect(enterPhrase(empty(12), 3, 'Aband')).toEqual(empty(12).with(3, 'aband'));
    });

    it('drops the space that ends the word', () => {
        expect(enterPhrase(empty(12), 0, 'abandon ')).toEqual(empty(12).with(0, 'abandon'));
    });

    it('empties the box when its word is taken out', () => {
        expect(enterPhrase(twelve, 11, '')).toEqual(twelve.with(11, ''));
    });

    it('fills every box from the first with a whole phrase, wherever it was put', () => {
        expect(enterPhrase(empty(12), 5, twentyFour.join(' '))).toEqual(twentyFour);
        expect(enterPhrase(empty(12), 7, twelve.join(' '))).toEqual(twelve);
        expect(enterPhrase(legal.with(3, ''), 9, twentyFour.join(' '))).toEqual(twentyFour);
        expect(enterPhrase(twelve, 0, exported(twentyFour))).toEqual(twentyFour);
    });

    it('takes twelve words pasted into 24 boxes for half a phrase, and never puts out the other half', () => {
        const first = legal.slice(0, 12);
        const second = legal.slice(12);

        expect(enterPhrase([...first, ...empty(12)], 12, second.join(' '))).toEqual(legal);

        const back = enterPhrase(empty(24), 12, second.join(' ')) ?? [];

        expect(back).toEqual([...empty(12), ...second]);
        expect(enterPhrase(back, 0, first.join(' '))).toEqual(legal);
    });

    it('never takes boxes away: twelve words in 24 boxes leave the other twelve to the switch', () => {
        expect(enterPhrase(empty(24), 0, twelve.join(' '))).toEqual([...twelve, ...empty(12)]);
        expect(enterPhrase(empty(24), 13, twelve.join(' '))).toBeUndefined();
    });

    it('lays a few words from that box on', () => {
        expect(enterPhrase(empty(12), 2, 'abandon ability able')).toEqual(['', '', 'abandon', 'ability', 'able', ...empty(7)]);
    });

    it('grows to 24 boxes for a run that does not fit in 12, rather than cutting it', () => {
        const thirteen = [...twelve, 'abandon'];

        expect(enterPhrase(empty(12), 0, thirteen.join(' '))).toEqual([...thirteen, ...empty(11)]);
        expect(enterPhrase(twelve, 10, 'abandon ability able')).toEqual([...twelve.slice(0, 10), 'abandon', 'ability', 'able', ...empty(11)]);
    });

    it('refuses a run that would not fit in 24', () => {
        expect(enterPhrase(empty(12), 0, [...twentyFour, 'abandon'].join(' '))).toBeUndefined();
        expect(enterPhrase(empty(24), 20, 'abandon ability able about above')).toBeUndefined();
    });

    it('gives back a phrase that passes its checksum, at either length', () => {
        for (const phrase of [twelve, twentyFour, legal]) {
            const words = enterPhrase(empty(12), 0, exported(phrase));

            expect(Mnemonic.isValidMnemonic((words ?? []).join(' '))).toBe(true);
        }
    });
});
