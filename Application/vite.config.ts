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

export default defineConfig(() => ({

    clearScreen: false,

    define:
    {
        __APP_VERSION__: JSON.stringify(version)
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
