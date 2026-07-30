/**
 * The Kotlin side of the recovery-phrase export, injected on the app's own webview only.
 *
 * Both calls return an empty string on success, or a short reason on failure — `unsupported` when the
 * device predates scoped storage, otherwise whatever the platform reported.
 */
interface ExportBridge
{
    saveImage: (base64Png: string, name: string) => string;
    saveText: (text: string, name: string) => string;
}

declare global
{
    interface Window
    {
        __nuraExport?: ExportBridge;
    }
}

/**
 * getExporter - The Android export bridge, when this build is running on one.
 *
 * Writing to the gallery or to Downloads needs MediaStore, which the webview cannot reach, so the
 * feature simply does not exist off Android and callers hide the controls.
 * @returns {ExportBridge | undefined} The bridge, or `undefined` elsewhere.
 */
export const getExporter = () => window.__nuraExport;

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
