import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

import { defineConfig, type EnvironmentOptions } from 'vite';

import { emitTargets } from './extension/emit';
import { appVersion } from './extension/version';
import { inpageModule } from './extension/plugin.inpage';

const icon = `data:image/png;base64,${readFileSync('src/assets/image/logo.png').toString('base64')}`;

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const build = 'dist-extension/build';
const out = 'dist-extension';

// The floor for content_scripts.world, which only Chrome is told to use. The other two engines
// get the same file through a script tag, so their real floor is lower.
const target = ['chrome111', 'firefox115', 'safari16.4'];

/**
 * A bundle the manifest names by a fixed path. Rolldown will not emit an IIFE made of more than
 * one chunk — an IIFE has no import mechanism — so these are one input each, inlined, unhashed.
 */
const single = (name: string, input: string, format: 'iife' | 'esm'): EnvironmentOptions => ({
    consumer: 'client',

    build: {
        target,
        outDir: build,
        emptyOutDir: false,
        copyPublicDir: false,
        rolldownOptions: {
            input: { [name]: input },
            // An IIFE has no import mechanism, so each of these must stay a single chunk.
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
            '#platform-impl': here('extension/platform.ts')
        }
    },

    plugins: [react(), tailwind(), inpageModule({ icon, chainId: 1020 })],

    environments: {
        // The popup is an ordinary app build: code splitting, lazy routes, hashed assets.
        client: {
            build: {
                target,
                outDir: build,
                emptyOutDir: true,
                chunkSizeWarningLimit: 1024,
                rolldownOptions: { input: { popup: here('extension/popup.html') } }
            }
        },

        // An ES module, and not by preference: `ethers` and the storage graph put top-level await
        // in this bundle, which a classic script cannot hold.
        background: single('background', here('extension/background.ts'), 'esm'),

        // Content scripts are classic scripts in every engine — `import` throws in them.
        content: single('content', here('extension/content.ts'), 'iife'),

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
