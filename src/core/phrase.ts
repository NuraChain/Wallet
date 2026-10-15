/** The lengths of recovery phrase the import takes: the 12 words a software wallet makes, and the 24 a hardware wallet does. */
export const phraseLengths = [12, 24] as const;

export type PhraseLength = (typeof phraseLengths)[number];

const longest = 24;

/* The number in front of a word in a copy of the phrase — written down, or the wallet's own text
   export, which is `1. abandon` a line. No word on the list has a digit, so none can start with one. */
const numbering = /^\d+[.):-]?/u;

/**
 * The words in what was typed or pasted: split at spaces, line breaks and commas, lower-cased — a
 * phone capitalizes the first word, and the checksum is over the lower-case one — and without the
 * numbers a copy of the phrase is so often written with.
 */
export const phraseWords = (text: string) =>
    text
        .toLowerCase()
        .split(/[\s,]+/u)
        .map((word) => word.replace(numbering, ''))
        .filter((word) => word.length > 0);

/**
 * The boxes at a new length. The first 12 words of a 24-word phrase pass its checksum about one time
 * in sixteen, and open another wallet — an empty one — without a word of warning; so words are only
 * dropped when the boxes that go are empty, and otherwise every box starts over.
 */
export const resizePhrase = (words: string[], length: PhraseLength) => {
    const dropped = words.slice(length).some((word) => word.length > 0);

    return Array.from({ length }, (_, index) => (dropped ? '' : (words[index] ?? '')));
};

/**
 * The boxes once `text` is typed or pasted into box `index`.
 *
 * One word, or none, is that box's. As many words as there are boxes, or 24, are the whole phrase:
 * they fill every box from the first, wherever they were put, and 24 grow the boxes to match. Any
 * other run is laid from that box on, and the boxes grow to 24 when it runs past them. A run that
 * would not fit in 24 is `undefined`: it is never cut to fit.
 *
 * A paste never takes boxes away — only the switch between 12 and 24 does, and `resizePhrase`
 * will not cut words. Twelve words pasted into 24 boxes are half a phrase, not the whole of a
 * shorter one: read as a whole, the second half pasted after a typed first half would have put the
 * first half out, and opened another wallet about one time in sixteen.
 */
export const enterPhrase = (words: string[], index: number, text: string): string[] | undefined => {
    const entered = phraseWords(text);

    if (entered.length <= 1) {
        return words.map((word, at) => (at === index ? (entered[0] ?? '') : word));
    }

    if (entered.length === words.length || entered.length === longest) {
        return entered;
    }

    const end = index + entered.length;

    if (end > longest) {
        return undefined;
    }

    const next = end > words.length ? resizePhrase(words, longest) : [...words];

    next.splice(index, entered.length, ...entered);

    return next;
};
