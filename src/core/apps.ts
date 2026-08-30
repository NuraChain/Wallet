import { getValue, setValue } from '../utility/storage';

export interface DappEntry {
    id: string;
    name: string;
    url: string;
}

const defaultApps: DappEntry[] = [{ id: 'swap', name: 'Swap', url: 'https://swap.nurachain.net' }];

export const getApps = async (): Promise<DappEntry[]> => {
    const stored = await getValue('App.Apps');

    if (stored === undefined) {
        return defaultApps;
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(stored) as DappEntry[];

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((item) => typeof item?.id === 'string' && typeof item.name === 'string' && typeof item.url === 'string' && item.url.length > 0);
    } catch {
        return [];
    }
};

export const setApps = async (list: DappEntry[]) => setValue('App.Apps', JSON.stringify(list));
