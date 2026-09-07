import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const host = process.env.TAURI_DEV_HOST;

const icon = `data:image/png;base64,${readFileSync('src/assets/image/logo.png').toString('base64')}`;

const version = /^version\s*=\s*"(?<semver>[^"]+)"/mu.exec(readFileSync('src-tauri/Cargo.toml', 'utf8'))?.groups?.semver ?? '0.0.0';

export default defineConfig(() => ({
    root: 'src',
    envDir: '..',
    clearScreen: false,

    define: {
        __APP_ICON__: JSON.stringify(icon),
        __APP_VERSION__: JSON.stringify(version)
    },

    // The build's half of the platform seam: which implementation "#platform-impl" resolves to
    // is what decides whether this bundle carries Tauri or a browser extension underneath it.
    resolve: {
        alias: {
            '#platform-impl': fileURLToPath(new URL('src/platform/tauri.ts', import.meta.url))
        }
    },

    plugins: [react(), tailwind()],

    build: {
        outDir: '../dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1024
    },

    test: {
        include: ['**/*.test.ts'],
        environment: 'node',
        restoreMocks: true
    },

    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: 'ws',
                  host,
                  port: 1421
              }
            : undefined,
        watch: {
            ignored: ['**/dist/**', '**/src-tauri/**']
        }
    }
}));
