import { BaseDirectory, mkdir, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { getPlatform } from '../utility/platform';

interface AndroidBridge {
    saveImage: (base64Png: string, name: string) => string;
    saveText: (text: string, name: string) => string;
}

declare global {
    interface Window {
        __nuraExport?: AndroidBridge;
    }
}

export interface Exporter {
    saveImage: (base64Png: string, name: string) => Promise<string>;
    saveText: (text: string, name: string) => Promise<string>;
}

const pictureFolder = 'Nura Wallet';

const reason = (cause: unknown) => (cause instanceof Error && cause.message.length > 0 ? cause.message : 'failed');

const desktopExporter: Exporter = {
    saveImage: async (base64Png: string, name: string) => {
        try {
            const binary = atob(base64Png);
            const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

            await mkdir(pictureFolder, { baseDir: BaseDirectory.Picture, recursive: true });

            await writeFile(`${pictureFolder}/${name}`, bytes, { baseDir: BaseDirectory.Picture });

            return '';
        } catch (cause) {
            return reason(cause);
        }
    },

    saveText: async (text: string, name: string) => {
        try {
            await writeTextFile(name, text, { baseDir: BaseDirectory.Download });

            return '';
        } catch (cause) {
            return reason(cause);
        }
    }
};

/**
 * iOS has no ExportBridge of its own yet, and the fs plugin is a desktop-only dependency, so there
 * is nothing on that platform that could write the file. It says so in the same word the Android
 * bridge uses when the write is refused, and the phrase stays on screen to be copied by hand.
 */
const unsupportedExporter: Exporter = {
    saveImage: async () => 'unsupported',
    saveText: async () => 'unsupported'
};

export const getExporter = (): Exporter => {
    const bridge = window.__nuraExport;

    if (bridge === undefined) {
        return getPlatform() === 'ios' ? unsupportedExporter : desktopExporter;
    }

    return {
        saveImage: async (base64Png: string, name: string) => bridge.saveImage(base64Png, name),
        saveText: async (text: string, name: string) => bridge.saveText(text, name)
    };
};

export const phraseToPng = (words: string[], title: string, warning: string) => {
    const columns = 3;
    const rows = Math.ceil(words.length / columns);
    const cell = { width: 300, height: 84 };
    const pad = 56;

    const width = pad * 2 + cell.width * columns;
    const height = pad * 2 + 120 + rows * cell.height + 80;

    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (context === null) {
        return '';
    }

    context.fillStyle = '#0C1740';
    context.fillRect(0, 0, width, height);

    context.fillStyle = '#FFFFFF';
    context.font = 'bold 40px sans-serif';
    context.fillText(title, pad, pad + 44);

    words.forEach((word, index) => {
        const x = pad + (index % columns) * cell.width;
        const y = pad + 120 + Math.floor(index / columns) * cell.height;

        context.fillStyle = '#16224F';
        context.fillRect(x, y, cell.width - 16, cell.height - 16);

        context.fillStyle = '#7DA2E8';
        context.font = '26px sans-serif';
        context.fillText(String(index + 1), x + 18, y + 44);

        context.fillStyle = '#FFFFFF';
        context.font = 'bold 30px monospace';
        context.fillText(word, x + 62, y + 44);
    });

    context.fillStyle = '#FF9B9B';
    context.font = '24px sans-serif';
    context.fillText(warning, pad, height - pad);

    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
};
