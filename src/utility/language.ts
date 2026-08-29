import { on, off, emit } from './event';
import { setValue, getValue } from './storage';

import flagBr from '../assets/flag/br.svg';
import flagCn from '../assets/flag/cn.svg';
import flagEs from '../assets/flag/es.svg';
import flagFr from '../assets/flag/fr.svg';
import flagIn from '../assets/flag/in.svg';
import flagIr from '../assets/flag/ir.svg';
import flagRu from '../assets/flag/ru.svg';
import flagSa from '../assets/flag/sa.svg';
import flagTr from '../assets/flag/tr.svg';
import flagUs from '../assets/flag/us.svg';

export type LanguageType = 'en' | 'fa' | 'ar' | 'es' | 'pt' | 'hi' | 'zh' | 'ru' | 'fr' | 'tr';

let languageCurrent: LanguageType = 'en';
let languageMap: Record<string, Record<string, never>> = {};

/**
 * Language metadata used by the UI for display and locale selection.
 *
 * The flag is an imported asset rather than a `flag-icons` class. That package's stylesheet reaches
 * every one of its 260-odd flags through `url()`, so the bundler copied 3.8 MB of them into `dist`
 * to serve the handful this list actually names. Importing the ten directly costs 128 KB, and the
 * bundler can see which ones are reachable instead of having to keep them all.
 *
 * A flag names a country and a language does not, so two of these are a judgement rather than a
 * fact: Arabic flies Saudi Arabia's as the usual stand-in for Modern Standard Arabic, and
 * Portuguese flies Brazil's because that is where the overwhelming majority of its speakers are.
 * Either can be swapped by changing the import and the entry together.
 *
 * The order is the one the picker shows, not an alphabetical one — English and Persian lead because
 * they are the two the app shipped with.
 */
export const languageRecord: { code: LanguageType; country: string; emoji: string; flag: string }[] = [
    { code: 'en', country: 'us', emoji: '🇺🇸', flag: flagUs },
    { code: 'fa', country: 'ir', emoji: '🇮🇷', flag: flagIr },
    { code: 'ar', country: 'sa', emoji: '🇸🇦', flag: flagSa },
    { code: 'es', country: 'es', emoji: '🇪🇸', flag: flagEs },
    { code: 'pt', country: 'br', emoji: '🇧🇷', flag: flagBr },
    { code: 'hi', country: 'in', emoji: '🇮🇳', flag: flagIn },
    { code: 'zh', country: 'cn', emoji: '🇨🇳', flag: flagCn },
    { code: 'ru', country: 'ru', emoji: '🇷🇺', flag: flagRu },
    { code: 'fr', country: 'fr', emoji: '🇫🇷', flag: flagFr },
    { code: 'tr', country: 'tr', emoji: '🇹🇷', flag: flagTr }
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
const resolve = (name: string): string | undefined => {
    let result = languageMap;

    for (const key of name.split('.')) {
        if (result[key] === undefined) {
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
export const setLanguage = async (lang: LanguageType) => {
    await setValue('App.Language', lang);

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    languageMap = (await import(`../assets/lang/${lang}.json`)).default;

    languageCurrent = lang;

    document.documentElement.lang = lang;

    document.documentElement.dir = ['fa', 'ar'].includes(lang) ? 'rtl' : 'ltr';

    // Announced last, so a listener that re-renders is reading the bundle that is already in place.
    //
    // Most of the app never needed this: the picker is a modal, and closing it is a state change on
    // the page underneath, which re-renders the whole tree with the new strings as a side effect.
    // Anything mounted *outside* that page has no such luck — the title bar is a sibling of the page
    // layout, so it kept whatever `T()` returned when the window opened.
    emit('Language.Change', lang);
};

/**
 * Subscribe to language changes, in the shape `useSyncExternalStore` wants.
 * @param {() => void} listener Called after a new bundle is applied.
 * @returns {() => void} Unsubscribes the listener.
 */
export const subscribeLanguage = (listener: () => void) => {
    on('Language.Change', listener);

    return () => {
        off('Language.Change', listener);
    };
};

/**
 * The active language code.
 *
 * Returns the module's own `languageCurrent` rather than a fresh object, because it is the snapshot
 * `useSyncExternalStore` compares between renders — a new object every call would loop forever.
 * @returns {LanguageType} The code of the language currently applied.
 */
export const getLanguageCode = () => languageCurrent;

/**
 * Return metadata for the current language.
 *
 * The returned object can be used for flags, labels, or locale-specific UI.
 * @returns {{ Code: LanguageType; Country: string }} Current language metadata.
 */
export const getLanguage = () => {
    const lang = languageRecord.find((i) => i.code === languageCurrent);

    if (lang === undefined) {
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
// oxlint-disable-next-line @typescript-eslint/naming-convention
export const T = (name: string, ...args: (string | number)[]): string => {
    const template = resolve(name) ?? `[${name}]`;

    let index = 0;

    // One global pass through a replacer function, and both halves of that matter, because a custom
    // network's ticker reaches this as `%s` and is typed by the user.
    //
    // A function rather than a string, because a string replacement reads `$&`, `` $` ``, `$'` and
    // `$1` in the *replacement* as patterns — a symbol containing `$&` would splice the matched `%s`
    // back into its own translation instead of the value.
    //
    // One pass rather than one per argument, because replacing them one at a time re-scans what the
    // previous one already wrote. A ticker of `A%sB` would put a live `%s` earlier in the string than
    // the template's own next slot, so the following argument would land inside the ticker and the
    // real slot would survive as a literal `%s`. A replacer's output is never rescanned, so a value
    // can only ever be a value.
    return template.replaceAll('%s', () => {
        const arg = args[index];

        index += 1;

        // More placeholders than arguments leaves the surplus visible rather than blanking it, which
        // is the same way a missing key renders — a gap in a translation should look like one.
        return arg === undefined ? '%s' : arg.toString();
    });
};

/**
 * Load the persisted language selection and apply it.
 *
 * Unknown or missing stored values fall back to English.
 *
 * Nothing here is allowed to reject. This is awaited before the first render, so a storage read that
 * throws or a bundle that will not load would cost the window rather than the strings — and the app
 * without its strings still opens, showing the visible `[Dotted.Key]` placeholders that exist for
 * exactly this.
 * @returns {Promise<void>} Resolves after the active language is initialized.
 */
export const initLanguage = async () => {
    const language = await getValue('App.Language').catch(() => undefined);

    const record = languageRecord.find((item) => item.code === language);

    await setLanguage(record?.code ?? 'en').catch(() => undefined);
};

export const getDirection = () => (['fa', 'ar'].includes(languageCurrent) ? 'rtl' : 'ltr');
