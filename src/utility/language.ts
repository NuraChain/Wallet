import { preload } from 'react-dom';

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

for (const item of languageRecord) {
    preload(item.flag, { as: 'image' });
}

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

export const setLanguage = async (lang: LanguageType) => {
    await setValue('App.Language', lang);

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    languageMap = (await import(`../assets/lang/${lang}.json`)).default;

    languageCurrent = lang;

    document.documentElement.lang = lang;

    document.documentElement.dir = ['fa', 'ar'].includes(lang) ? 'rtl' : 'ltr';

    emit('Language.Change', lang);
};

export const subscribeLanguage = (listener: () => void) => {
    on('Language.Change', listener);

    return () => {
        off('Language.Change', listener);
    };
};

export const getLanguageCode = () => languageCurrent;

export const getLanguage = () => {
    const lang = languageRecord.find((i) => i.code === languageCurrent);

    if (lang === undefined) {
        return languageRecord[0];
    }

    return lang;
};

// oxlint-disable-next-line @typescript-eslint/naming-convention
export const T = (name: string, ...args: (string | number)[]): string => {
    const template = resolve(name) ?? `[${name}]`;

    let index = 0;

    return template.replaceAll('%s', () => {
        const arg = args[index];

        index += 1;

        return arg === undefined ? '%s' : arg.toString();
    });
};

export const initLanguage = async () => {
    const language = await getValue('App.Language').catch(() => undefined);

    const record = languageRecord.find((item) => item.code === language);

    await setLanguage(record?.code ?? 'en').catch(() => undefined);
};

export const getDirection = () => (['fa', 'ar'].includes(languageCurrent) ? 'rtl' : 'ltr');
