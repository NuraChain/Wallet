export const phraseLengths = [12, 24] as const;

export type PhraseLength = (typeof phraseLengths)[number];

const longest = 24;

/* `1. abandon`-style numbering; no word on the list contains a digit. */
const numbering = /^\d+[.):-]?/u;

/** Lower-cased because a phone capitalizes the first word and the checksum is over lower case. */
export const phraseWords = (text: string) =>
    text
        .toLowerCase()
        .split(/[\s,]+/u)
        .map((word) => word.replace(numbering, ''))
        .filter((word) => word.length > 0);

/** Words are dropped only from empty boxes: the first 12 of a 24-word phrase pass its checksum 1 time in 16 and open an empty wallet. */
export const resizePhrase = (words: string[], length: PhraseLength) => {
    const dropped = words.slice(length).some((word) => word.length > 0);

    return Array.from({ length }, (_, index) => (dropped ? '' : (words[index] ?? '')));
};

/**
 * As many words as there are boxes (or 24) fill from the first box; any other run is laid from `index` on, never cut to fit.
 * A paste never removes boxes: 12 words into 24 boxes are half a phrase, or a split paste could open another wallet.
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
