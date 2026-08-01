import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

import { defineConfig, type Plugin } from 'vite';

const host = process.env.TAURI_DEV_HOST;

/**
 * Port the standalone React DevTools app listens on.
 */
const devtoolsPort = 8097;

/**
 * reactDevtools - Connects the app to the standalone React DevTools during development.
 *
 * The browser extension cannot reach this UI: it renders inside WebView2 on Windows and the system
 * WebView on Android, neither of which loads extensions. The standalone app is the supported route
 * for an embedded webview — it listens on a socket and the page opts in by loading its backend.
 *
 * The tag is prepended to `<head>` because the backend has to install its hook before React renders,
 * and React is loaded by the module script at the end of `<body>`.
 *
 * `apply: 'serve'` is the important part: the plugin never runs for `vite build`, so no production
 * bundle carries a devtools hook or reaches for a localhost socket. On a phone `localhost` is the
 * device itself, so the host Tauri already publishes for the dev server is reused when it is set.
 * @returns {Plugin} The Vite plugin.
 */
const reactDevtools = (): Plugin => ({
    name: 'nura:react-devtools',
    apply: 'serve',
    transformIndexHtml: () => [
        {
            tag: 'script',
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
            attrs: { src: `http://${ host || 'localhost' }:${ devtoolsPort }` },
            injectTo: 'head-prepend'
        }
    ]
});

export default defineConfig(() => ({

    clearScreen: false,

    plugins:
    [
        react(),
        tailwind(),
        reactDevtools()
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
