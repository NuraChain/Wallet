import { useRef, type ReactNode } from 'react';

import Text from './text';

import { cn } from '../utility/cn';
import { fieldSurface } from './token';

const veiled = 'pointer-events-none blur-sm select-none';

export function SecretKey({ revealed, children }: { revealed: boolean; children: ReactNode }) {
    return (
        <div dir='ltr' className={cn('rounded-control bg-base-1 px-3 py-2.5 transition-[filter] duration-(--duration-fast)', !revealed && veiled)}>
            {children}
        </div>
    );
}

/** Two columns before `sm` and no `truncate`: a clipped word is written down clipped and the wallet is lost. */
export function SecretWords({ revealed, children }: { revealed: boolean; children: ReactNode }) {
    return (
        <div dir='ltr' className={cn('grid grid-cols-2 gap-1.5 transition-[filter] duration-(--duration-fast) sm:grid-cols-3', !revealed && veiled)}>
            {children}
        </div>
    );
}

/**
 * A multi-word paste goes to the caller whole: an input drops line breaks and would join the words.
 * The keyboard is asked not to correct or learn the words.
 */
export function PhraseInput({ words, onEnter }: { words: string[]; onEnter: (index: number, text: string) => void }) {
    const boxes = useRef<(HTMLInputElement | null)[]>([]);

    const focus = (index: number) => {
        boxes.current[index]?.focus();
    };

    return (
        <div dir='ltr' className='grid grid-cols-2 gap-1.5 sm:grid-cols-3'>
            {words.map((word, index) => (
                // Keyed by word, the box would remount on every keystroke and lose the caret.
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

export function SecretWord({ index, word }: { index: number; word: string }) {
    return (
        <div className='flex items-baseline gap-1.5 rounded-control bg-base-1 px-2 py-1.5'>
            <Text shrink={false} tabular text={String(index + 1)} />

            <Text variant='captionStrong' mono text={word} />
        </div>
    );
}
