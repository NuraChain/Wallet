import { setValue, getValue } from './storage';

type ThemeType = 'light' | 'dark';

let themeCurrent: ThemeType = 'light';

const apply = (theme: ThemeType) => {
    themeCurrent = theme;

    document.documentElement.dataset.theme = theme;
};

export const setTheme = async (theme: ThemeType) => {
    apply(theme);

    await setValue('App.Theme', theme);
};

export const getTheme = () => themeCurrent;

export const initTheme = async () => {
    const theme = await getValue('App.Theme').catch(() => undefined);

    if (theme === 'light' || theme === 'dark') {
        apply(theme);

        return;
    }

    apply(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
};
