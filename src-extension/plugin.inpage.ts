import { runnerImport, type Plugin } from 'vite';

import type { DappIdentity } from '../src/core/dapp.script.ts';

const specifier = 'virtual:nura-inpage';

interface DappScriptModule {
    dappScript: (identity: DappIdentity) => string;
    dappIdentity: (chainId: number, channel?: 'native' | 'extension') => DappIdentity;
}

/**
 * The provider the wallet injects is a source string built by `dappScript()`, which is what the
 * Tauri and Android targets hand to their native layers. An extension cannot ship a string —
 * MV3 forbids eval, and most dApp sites forbid it too — so the string is evaluated at build time
 * and becomes the source of a real bundled file. One definition, five targets, no drift.
 */
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
