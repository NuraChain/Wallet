import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({

    clearScreen: false,

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
