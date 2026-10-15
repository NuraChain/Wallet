import { useRef, type ReactNode } from 'react';

import Text from './text';

import { cn } from '../utility/cn';
import { fieldSurface } from './token';

// Until the user asks to see it, the secret is blurred, and cannot be selected or copied.
const veiled = 'pointer-events-none blur-sm select-none';

/** A private key, laid out left to right in every language. */
export function SecretKey({ revealed, children }: { revealed: boolean; children: ReactNode }) {
    return (
        <div dir='ltr' className={cn('rounded-control bg-base-1 px-3 py-2.5 transition-all duration-(--duration-fast)', !revealed && veiled)}>
            {children}
        </div>
    );
}

/**
 * A recovery phrase's words: two columns before `sm`, and no `truncate` on the word. Three columns
 * in a 320px dialog left about 55px for the word, and the wordlist has 8-character entries that need
 * nearer 58 — `abstract`, `business`, `champion`. A word clipped to `busines` is written down that
 * way and the wallet is gone.
 */
export function SecretWords({ revealed, children }: { revealed: boolean; children: ReactNode }) {
    return (
        <div dir='ltr' className={cn('grid grid-cols-2 gap-1.5 transition-all duration-(--duration-fast) sm:grid-cols-3', !revealed && veiled)}>
            {children}
        </div>
    );
}

/**
 * Boxes to type a recovery phrase into, a word each, numbered as it was written down, in the columns
 * `SecretWords` shows it in. A space or Enter goes on to the next box and Backspace in an empty one
 * back to the last. A paste of more than one word is handed over as it was copied: a box keeps no
 * line breaks, and would have made `1. abandon⏎2. ability` into `1. abandon2. ability`. The keyboard
 * is asked not to capitalize, correct or learn — one that does is wrong about every one of these
 * words, and should not remember them — though only it decides whether to listen.
 */
export function PhraseInput({ words, onEnter }: { words: string[]; onEnter: (index: number, text: string) => void }) {
    const boxes = useRef<(HTMLInputElement | null)[]>([]);

    const focus = (index: number) => {
        boxes.current[index]?.focus();
    };

    return (
        <div dir='ltr' className='grid grid-cols-2 gap-1.5 sm:grid-cols-3'>
            {words.map((word, index) => (
                // A box is its place in the phrase. Keyed by its word, it would be a new box at every
                // keystroke, and the caret would go with the old one.
                // oxlint-disable-next-line react/no-array-index-key
                <label key={index} className='relative flex items-center'>
                    <span className='pointer-events-none absolute inset-s-2.5 text-tiny text-txt-muted tabular-nums'>{index + 1}</span>

                    <input
                        ref={(box) => {
                            boxes.current[index] = box;
                        }}
                        type='text'
                        value={word}
                        autoComplete='off'
                        autoCapitalize='none'
                        autoCorrect='off'
                        spellCheck={false}
                        enterKeyHint={index === words.length - 1 ? 'done' : 'next'}
                        onChange={(event) => {
                            const { value } = event.target;

                            onEnter(index, value);

                            // A phone's keyboard sends the space as text, not as a key.
                            if (/\S\s+$/u.test(value)) {
                                focus(index + 1);
                            }
                        }}
                        onKeyDown={(event) => {
                            if (event.key === ' ' || event.key === 'Enter') {
                                event.preventDefault();

                                focus(index + 1);
                            }

                            if (event.key === 'Backspace' && word.length === 0 && index > 0) {
                                event.preventDefault();

                                focus(index - 1);
                            }
                        }}
                        onPaste={(event) => {
                            const text = event.clipboardData.getData('text');

                            if (/\S\s+\S/u.test(text)) {
                                event.preventDefault();

                                onEnter(index, text);
                            }
                        }}
                        className={cn(fieldSurface, 'h-9 w-full min-w-0 rounded-control ps-8 pe-2 font-mono text-small')}
                    />
                </label>
            ))}
        </div>
    );
}

/** One word of the phrase, with its position in front of it. */
export function SecretWord({ index, word }: { index: number; word: string }) {
    return (
        <div className='flex items-baseline gap-1.5 rounded-control bg-base-1 px-2 py-1.5'>
            <Text shrink={false} tabular text={String(index + 1)} />

            <Text variant='captionStrong' mono text={word} />
        </div>
    );
}
