import type { ReactNode } from 'react';

import Text from './text';

import { cn } from '../utility/cn';

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

/** One word of the phrase, with its position in front of it. */
export function SecretWord({ index, word }: { index: number; word: string }) {
    return (
        <div className='flex items-baseline gap-1.5 rounded-control bg-base-1 px-2 py-1.5'>
            <Text shrink={false} tabular text={String(index + 1)} />

            <Text variant='captionStrong' mono text={word} />
        </div>
    );
}
