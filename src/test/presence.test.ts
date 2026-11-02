import { describe, expect, it } from 'vitest';

import { presenceDetails, presencePlace, presenceSite, presenceState } from '../core/presence';

import type { DashboardModal } from '../type/app';

const at = (tab: string, modal: DashboardModal = 'none') => presenceState('/dashboard', { tab, modal });

describe('the activity Discord is shown', () => {
    it('names only the app before the wallet is open', () => {
        expect(presenceState('/', undefined)).toBeUndefined();
        expect(presenceState('/intro', undefined)).toBeUndefined();
        expect(presenceState('/unlock', undefined)).toBeUndefined();
        expect(presenceState('/somewhere', undefined)).toBeUndefined();
    });

    it('describes each tab of the dashboard', () => {
        expect(presenceState('/dashboard', undefined)).toBe('Viewing Dashboard');
        expect(at('Wallet')).toBe('Viewing Dashboard');
        expect(at('Browser')).toBe('Browsing dApps');
        expect(at('Swap')).toBe('Swapping Tokens');
        expect(at('Settings')).toBe('Configuring Wallet');
    });

    it('describes a dialog by what it is for, whichever tab it opens over', () => {
        expect(at('Wallet', 'send')).toBe('Sending NURA');
        expect(at('Wallet', 'receive')).toBe('Receiving Crypto');
        expect(at('Wallet', 'accounts')).toBe('Viewing Wallet');
        expect(at('Wallet', 'tokens')).toBe('Viewing Wallet');
        expect(at('Wallet', 'phrase')).toBe('Configuring Wallet');
        expect(at('Settings', 'language')).toBe('Configuring Wallet');
    });

    it('leaves the speed dial to the tab under it', () => {
        expect(at('Browser', 'speed')).toBe('Browsing dApps');
        expect(at('Wallet', 'speed')).toBe('Viewing Dashboard');
    });

    it('never passes on anything but its own fixed lines', () => {
        const fixed = new Set([
            'Viewing Dashboard',
            'Viewing Wallet',
            'Sending NURA',
            'Receiving Crypto',
            'Swapping Tokens',
            'Configuring Wallet',
            'Browsing dApps'
        ]);

        expect(fixed.has(at('0x70997970C51812dc3A010C7d01b50e0d17dc79C8') ?? '')).toBe(true);
        expect(fixed.has(at('constructor') ?? '')).toBe(true);
        expect(presenceState('/dashboard/0x70997970C51812dc3A010C7d01b50e0d17dc79C8', undefined)).toBeUndefined();
    });

    it('names a built-in dApp by its host alone', () => {
        expect(presenceSite('https://baziche.com')).toBe('baziche.com');
        expect(presenceSite('https://www.baziche.com/game/42?ref=0x70997970C51812dc3A010C7d01b50e0d17dc79C8#top')).toBe('baziche.com');
        expect(presenceSite('https://user:secret@Swap.NuraChain.net:8443/pool')).toBe('swap.nurachain.net');
        expect(presenceSite('https://play.baziche.com/')).toBe('play.baziche.com');
        expect(presenceSite('https://ashbringer.org./shop')).toBe('ashbringer.org');
    });

    it('names no other site, nothing on the machine or network of the user, and nothing that is not a web page', () => {
        expect(presenceSite('https://example.com')).toBeUndefined();
        expect(presenceSite('https://baziche.com.example.com')).toBeUndefined();
        expect(presenceSite('https://notbaziche.com')).toBeUndefined();
        expect(presenceSite('')).toBeUndefined();
        expect(presenceSite('baziche.com')).toBeUndefined();
        expect(presenceSite('http://localhost:5173')).toBeUndefined();
        expect(presenceSite('http://192.168.1.10/admin')).toBeUndefined();
        expect(presenceSite('file:///C:/wallet/backup.txt')).toBeUndefined();
        expect(presenceSite('data:text/html,hi')).toBeUndefined();
    });

    it('shows the place only while the browser is what is described', () => {
        const baziche = presencePlace('https://baziche.com');

        expect(presenceDetails(at('Browser'), baziche)).toBe('baziche.com');
        expect(presenceDetails(at('Browser', 'speed'), baziche)).toBe('baziche.com');
        expect(presenceDetails(at('Browser', 'send'), baziche)).toBeUndefined();
        expect(presenceDetails(at('Wallet'), baziche)).toBeUndefined();
        expect(presenceDetails(presenceState('/unlock', undefined), baziche)).toBeUndefined();
        expect(presenceDetails(at('Browser'), undefined)).toBeUndefined();
        expect(presenceDetails(at('Wallet'), presencePlace('https://baziche.com/app/games/chess'))).toBeUndefined();
    });
});

describe('the game Baziche is showing', () => {
    const line = (url: string, before?: string) => presenceDetails(at('Browser'), presencePlace(url, before === undefined ? undefined : presencePlace(before)));

    it('names each game by its page', () => {
        expect(line('https://baziche.com/app/games/hokm')).toBe('Hokm · baziche.com');
        expect(line('https://baziche.com/app/games/poker')).toBe('Poker · baziche.com');
        expect(line('https://baziche.com/app/games/backgammon')).toBe('Backgammon · baziche.com');
        expect(line('https://baziche.com/app/games/ludo')).toBe('Ludo · baziche.com');
        expect(line('https://www.baziche.com/app/games/Chess/create?seats=2#top')).toBe('Chess · baziche.com');
    });

    it('carries the game to the table it leads to, and to the next table', () => {
        expect(line('https://baziche.com/app/play/7f3a', 'https://baziche.com/app/games/backgammon/create')).toBe('Playing Backgammon · baziche.com');
        const lobby = presencePlace('https://baziche.com/app/games/ludo');
        const first = presencePlace('https://baziche.com/app/play/7f3a', lobby);
        const second = presencePlace('https://baziche.com/app/play/9c1d', first);

        expect(presenceDetails(at('Browser'), second)).toBe('Playing Ludo · baziche.com');
    });

    it('names no game at a table reached any other way', () => {
        expect(line('https://baziche.com/app/play/7f3a')).toBe('In a game · baziche.com');
        expect(line('https://baziche.com/app/play/7f3a', 'https://baziche.com/join/AB12')).toBe('In a game · baziche.com');
        expect(line('https://baziche.com/app/play/7f3a', 'https://baziche.com/app')).toBe('In a game · baziche.com');
        expect(line('https://baziche.com/app/play/7f3a', 'https://swap.nurachain.net/app/games/chess')).toBe('In a game · baziche.com');
    });

    it('leaves every other page of the site at its host', () => {
        expect(line('https://baziche.com/app/games')).toBe('baziche.com');
        expect(line('https://baziche.com/app/play')).toBe('baziche.com');
        expect(line('https://baziche.com/app/me/wallet', 'https://baziche.com/app/games/chess')).toBe('baziche.com');
        expect(line('https://baziche.com/app/people/someone')).toBe('baziche.com');
        expect(line('https://baziche.com/games/chess')).toBe('baziche.com');
    });

    it('names a game only from its own list', () => {
        expect(line('https://baziche.com/app/games/constructor')).toBe('baziche.com');
        expect(line('https://baziche.com/app/games/__proto__')).toBe('baziche.com');
        expect(line('https://baziche.com/app/games/0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe('baziche.com');
        expect(line('https://baziche.com/app/games/%3Cscript%3E')).toBe('baziche.com');
    });

    it('reads game paths on Baziche alone', () => {
        expect(line('https://swap.nurachain.net/app/games/chess')).toBe('swap.nurachain.net');
        expect(line('https://example.com/app/games/chess')).toBeUndefined();
        expect(line('https://baziche.com.example.com/app/games/chess')).toBeUndefined();
    });
});
