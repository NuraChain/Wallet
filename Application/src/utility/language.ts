import { setValue, getValue } from './storage';

export type LanguageType = 'en' | 'fa';

let languageCurrent: LanguageType = 'en';
let languageMap: Record<string, Record<string, never>> = {};

/**
 * Language metadata used by the UI for display and locale selection.
 */
export const languageRecord: { code: LanguageType; country: string; emoji: string } [] =
[
    { code: 'en', country: 'us', emoji: '🇺🇸' },
    { code: 'fa', country: 'ir', emoji: '🇮🇷' }
];

/**
 * Resolve a dotted translation key against the loaded language tree.
 *
 * Example:
 * - `Splash.Header`
 * - `App.Tray.Open`
 *
 * Missing segments return `undefined`, which lets the caller decide on a fallback.
 * @param {string} name Dot-separated key path.
 * @returns {string | undefined} Resolved localized string or undefined.
 */
const resolve = (name: string): string | undefined =>
{
    let result = languageMap;

    for (const key of name.split('.'))
    {
        if (typeof result[key] === 'undefined')
        {
            return undefined;
        }

        result = result[key];
    }

    return typeof result === 'string' ? result : undefined;
};

/**
 * Apply a language bundle.
 *
 * This updates:
 * - the in-memory translation map
 * - persisted language preference
 * - the document text direction
 *
 * @param {LanguageType} lang Language code to activate.
 * @returns {Promise<void>} Resolves after the bundle is loaded and applied.
 */
export const setLanguage = async(lang: LanguageType) =>
{
    await setValue('App.Language', lang);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    languageMap = (await import(`../assets/lang/${ lang }.json`)).default;

    languageCurrent = lang;

    document.documentElement.lang = lang;

    document.documentElement.dir = [ 'fa', 'ar' ].includes(lang) ? 'rtl' : 'ltr';
};

/**
 * Return metadata for the current language.
 *
 * The returned object can be used for flags, labels, or locale-specific UI.
 * @returns {{ Code: LanguageType; Country: string }} Current language metadata.
 */
export const getLanguage = () =>
{
    const lang = languageRecord.find((i) => i.code === languageCurrent);

    if (lang === undefined)
    {
        return languageRecord[0];
    }

    return lang;
};

/**
 * Translate a key using the active language bundle.
 *
 * If the key is missing, the helper returns a bracketed placeholder so missing translations are visible during development.
 *
 * `%s` placeholders are replaced in order with the provided arguments.
 * @param {string} name Translation key.
 * @param {...(string|number)} args Replacement values for `%s` tokens.
 * @returns {string} Translated string or a visible fallback placeholder.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const T = (name: string, ...args: (string | number)[]): string =>
{
    let template = resolve(name) ?? `[${ name }]`;

    for (const arg of args)
    {
        template = template.replace(/%s/, arg.toString());
    }

    return template;
};

/**
 * Load the persisted language selection and apply it.
 *
 * Unknown or missing stored values fall back to English.
 * @returns {Promise<void>} Resolves after the active language is initialized.
 */
export const initLanguage = async() =>
{
    const language = await getValue('App.Language');

    if (language !== undefined)
    {
        const record = languageRecord.find((i) => i.code === language);

        if (record)
        {
            await setLanguage(record.code);

            return;
        }
    }

    await setLanguage('en');
};

export const getDirection = () => ([ 'fa', 'ar' ].includes(languageCurrent) ? 'rtl' : 'ltr');
