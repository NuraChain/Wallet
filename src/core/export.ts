import { isTauri } from '@tauri-apps/api/core';
import { BaseDirectory, mkdir, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

/**
 * The Kotlin side of the recovery-phrase export, injected on the app's own webview only.
 *
 * Both calls return an empty string on success, or a short reason on failure — `unsupported` when the
 * device predates scoped storage, otherwise whatever the platform reported.
 */
interface AndroidBridge
{
    saveImage: (base64Png: string, name: string) => string;
    saveText: (text: string, name: string) => string;
}

declare global
{
    interface Window
    {
        __nuraExport?: AndroidBridge;
    }
}

/**
 * Writes the recovery phrase out to shared storage.
 *
 * Async because the desktop path goes through Tauri's IPC; Android answers synchronously and is
 * wrapped to match. Both resolve to an empty string on success or a short reason on failure, so the
 * caller reports the outcome the same way on either platform.
 */
export interface Exporter
{
    saveImage: (base64Png: string, name: string) => Promise<string>;
    saveText: (text: string, name: string) => Promise<string>;
}

/**
 * Folder the picture lands in, under the platform's own Pictures directory. Matches the Android
 * bridge, so the "saved to Pictures/Nura Wallet" notice is true on both.
 */
const pictureFolder = 'Nura Wallet';

/**
 * reason - Turns a thrown value into the short string the UI reports.
 * @param {unknown} cause Whatever was thrown.
 * @returns {string} A message, or `failed` when there is nothing useful to show.
 */
const reason = (cause: unknown) => (cause instanceof Error && cause.message.length > 0 ? cause.message : 'failed');

/**
 * The desktop export, over Tauri's filesystem plugin.
 *
 * Deliberately writes to the same two places Android does rather than opening a save dialog, so the
 * screen behaves identically on both — the phrase is a backup the user is told to move somewhere
 * offline and delete, and making them choose a folder invites leaving it wherever the dialog opened.
 *
 * The capability grants writes to those two directories only; nothing else on disk is reachable.
 */
const desktopExporter: Exporter =
{
    saveImage: async(base64Png: string, name: string) =>
    {
        try
        {
            const binary = atob(base64Png);
            const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

            await mkdir(pictureFolder, { baseDir: BaseDirectory.Picture, recursive: true });

            await writeFile(`${ pictureFolder }/${ name }`, bytes, { baseDir: BaseDirectory.Picture });

            return '';
        }
        catch (cause)
        {
            return reason(cause);
        }
    },

    saveText: async(text: string, name: string) =>
    {
        try
        {
            await writeTextFile(name, text, { baseDir: BaseDirectory.Download });

            return '';
        }
        catch (cause)
        {
            return reason(cause);
        }
    }
};

/**
 * getExporter - The export implementation for whichever platform this build is running on.
 *
 * Android keeps its own bridge because writing to the gallery needs MediaStore, which no webview can
 * reach. Everywhere else inside a Tauri window the filesystem plugin does the same job. Outside Tauri
 * entirely — `npm run dev` in a plain browser — there is nothing to write with, so the caller hides
 * the controls rather than offering a button that cannot work.
 * @returns {Exporter | undefined} The exporter, or `undefined` when the platform cannot save files.
 */
export const getExporter = (): Exporter | undefined =>
{
    const bridge = window.__nuraExport;

    if (bridge !== undefined)
    {
        return {
            saveImage: async(base64Png: string, name: string) => Promise.resolve(bridge.saveImage(base64Png, name)),
            saveText: async(text: string, name: string) => Promise.resolve(bridge.saveText(text, name))
        };
    }

    return isTauri() ? desktopExporter : undefined;
};

/**
 * phraseToPng - Draws the recovery phrase as a PNG and returns it base64-encoded.
 *
 * The image is composed here rather than captured off the screen, so the result holds the words and
 * the warning and nothing else that happened to be on display.
 * @param {string[]} words The ordered mnemonic words.
 * @param {string} title Heading for the card.
 * @param {string} warning Cautionary line printed under the words.
 * @returns {string} Base64 PNG data, without the data-URL prefix.
 */
export const phraseToPng = (words: string[], title: string, warning: string) =>
{
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

    if (context === null)
    {
        return '';
    }

    context.fillStyle = '#0C1740';
    context.fillRect(0, 0, width, height);

    context.fillStyle = '#FFFFFF';
    context.font = 'bold 40px sans-serif';
    context.fillText(title, pad, pad + 44);

    words.forEach((word, index) =>
    {
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
