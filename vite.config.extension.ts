import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

import { defineConfig, type EnvironmentOptions } from 'vite';

import { emitTargets } from './src-extension/emit.ts';
import { appVersion } from './src-extension/version.ts';
import { inpageModule } from './src-extension/plugin.inpage.ts';

const icon = `data:image/png;base64,${readFileSync('src/assets/image/logo.png').toString('base64')}`;

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const build = '.dist-extension/build';
const out = '.dist-extension';

// chrome116 is the floor for sidePanel.open; the other engines never call it.
const target = ['chrome116', 'firefox115', 'safari16.4'];

/** Named by a fixed path in the manifest; an IIFE cannot import, so one chunk, unhashed. */
const single = (name: string, input: string, format: 'iife' | 'esm'): EnvironmentOptions => ({
    consumer: 'client',

    build: {
        target,
        outDir: build,
        emptyOutDir: false,
        copyPublicDir: false,
        rolldownOptions: {
            input: { [name]: input },
            output: { format, entryFileNames: `${name}.js`, codeSplitting: false }
        }
    }
});

export default defineConfig({
    base: '/',
    publicDir: false,
    clearScreen: false,

    define: {
        __APP_ICON__: JSON.stringify(icon),
        __APP_VERSION__: JSON.stringify(appVersion)
    },

    resolve: {
        alias: {
            '#platform-impl': here('src-extension/platform.ts')
        }
    },

    plugins: [react(), tailwind(), inpageModule({ icon, chainId: 1020 })],

    environments: {
        // The side panel is an input of the popup's build so the two share every chunk.
        client: {
            build: {
                target,
                outDir: build,
                emptyOutDir: true,
                chunkSizeWarningLimit: 1024,
                rolldownOptions: { input: { popup: here('src-extension/popup.html'), sidepanel: here('src-extension/sidepanel.html') } }
            }
        },

        // ESM because `ethers` and the storage graph use top-level await.
        background: single('background', here('src-extension/background.ts'), 'esm'),

        // Content scripts are classic scripts in every engine — `import` throws in them.
        content: single('content', here('src-extension/content.ts'), 'iife'),

        // Same, and it is also read by pages whose own CSP forbids eval.
        inpage: single('inpage', 'virtual:nura-inpage', 'iife')
    },

    builder: {
        sharedConfigBuild: true,

        buildApp: async (builder) => {
            // client first: it is the one that empties the directory the other three append to.
            await builder.build(builder.environments.client!);
            await builder.build(builder.environments.background!);
            await builder.build(builder.environments.content!);
            await builder.build(builder.environments.inpage!);

            const written = await emitTargets({ build, out });

            // oxlint-disable-next-line no-console
            console.info(`\nPackaged ${written.join(', ')} into ${out}/`);
        }
    }
});
