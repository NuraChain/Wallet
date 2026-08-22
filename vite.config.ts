import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

/**
 * The app version, read out of `Cargo.toml` and baked into the bundle.
 *
 * That file is the only place a version is declared: Tauri takes the desktop and Android versions from
 * it, the release workflow names every installer after it, and `package.json` carries none at all. The
 * interface should not be the one exception that has to be remembered separately, so it is read here
 * rather than typed out again — a build can then only ever show the version it was built from.
 *
 * Read at config time, so the value is a literal in the output. Nothing looks it up at runtime, which
 * also means the browser preview shows the same number as a packaged build.
 */
const version = (/^version\s*=\s*"(?<semver>[^"]+)"/mu).exec(readFileSync('src-tauri/Cargo.toml', 'utf8'))?.groups?.semver ?? '0.0.0';

/**
 * The app logo as a data URI, for the wallet's EIP-6963 announcement.
 *
 * A dApp picking a wallet out of a list draws this icon, and the spec requires it to be an RFC-2397
 * data URI rather than a URL — which makes sense once you see where it ends up: the announcement is
 * made *inside a third-party page*, so an icon behind a URL would be a request that page could see,
 * block or serve something else for.
 *
 * Read here, at config time, for the same reason the version above is: it becomes a literal in the
 * bundle. Importing the PNG instead would give a URL, since it is over Vite's inline threshold, and
 * that is precisely what cannot be used. The same file the title bar shows, so the wallet a dApp
 * offers looks like the wallet the user opened.
 */
const icon = `data:image/png;base64,${ readFileSync('src/assets/image/logo.png').toString('base64') }`;

export default defineConfig(() => ({

    clearScreen: false,

    define:
    {
        __APP_VERSION__: JSON.stringify(version),
        __APP_ICON__: JSON.stringify(icon)
    },

    plugins:
    [
        react(),
        tailwind()
    ],

    build:
    {
        chunkSizeWarningLimit: 1024
    },

    server:
    {
        port: 1420,
        strictPort: true,
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
        host: host || false,
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        hmr: host ?
            {
                protocol: 'ws',
                host,
                port: 1421
            } :
            undefined,
        watch:
        {
            ignored:
            [
                '**/dist/**',
                '**/src-tauri/**'
            ]
        }
    }
}));
