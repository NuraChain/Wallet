import { describe, expect, it } from 'vitest';

import { presenceDetails, presenceSite, presenceState } from '../core/presence';

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

    it('shows the site only while the browser is what is described', () => {
        expect(presenceDetails(at('Browser'), 'baziche.com')).toBe('baziche.com');
        expect(presenceDetails(at('Browser', 'speed'), 'baziche.com')).toBe('baziche.com');
        expect(presenceDetails(at('Browser', 'send'), 'baziche.com')).toBeUndefined();
        expect(presenceDetails(at('Wallet'), 'baziche.com')).toBeUndefined();
        expect(presenceDetails(presenceState('/unlock', undefined), 'baziche.com')).toBeUndefined();
        expect(presenceDetails(at('Browser'), undefined)).toBeUndefined();
    });
});
