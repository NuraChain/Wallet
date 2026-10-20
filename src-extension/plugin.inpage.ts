import { runnerImport, type Plugin } from 'vite';

import type { DappIdentity } from '../src/type/dapp.ts';

const specifier = 'virtual:nura-inpage';

interface DappScriptModule {
    dappScript: (identity: DappIdentity) => string;
    dappIdentity: (chainId: number, channel?: 'native' | 'extension') => DappIdentity;
}

// MV3 and most dApp CSPs forbid eval, so dappScript()'s string becomes a bundled file at build time.
export const inpageModule = (input: { icon: string; chainId: number }): Plugin => ({
    name: 'nura:inpage',

    resolveId: (source) => (source === specifier ? `\0${specifier}` : undefined),

    load: async (source) => {
        if (source !== `\0${specifier}`) {
            return undefined;
        }

        const imported = await runnerImport<DappScriptModule>('./src/core/dapp.script.ts', {
            define: { __APP_ICON__: JSON.stringify(input.icon) }
        });

        return imported.module.dappScript(imported.module.dappIdentity(input.chainId, 'extension'));
    }
});
