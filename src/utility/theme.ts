import { setValue, getValue } from './storage';

export type ThemeType = 'light' | 'dark';

let themeCurrent: ThemeType = 'light';

/**
 * Apply a theme to the document.
 *
 * The `data-theme` attribute on `<html>` drives the CSS variable palette in `style.css`.
 * @param {ThemeType} theme Theme name to activate.
 */
const apply = (theme: ThemeType) =>
{
    themeCurrent = theme;

    document.documentElement.dataset.theme = theme;
};

/**
 * Activate a theme and persist the selection.
 * @param {ThemeType} theme Theme name to activate.
 * @returns {Promise<void>} Resolves after the preference is saved.
 */
export const setTheme = async(theme: ThemeType) =>
{
    apply(theme);

    await setValue('App.Theme', theme);
};

/**
 * Return the active theme name.
 * @returns {ThemeType} Current theme.
 */
export const getTheme = () => themeCurrent;

/**
 * Load the persisted theme selection and apply it.
 *
 * Missing or unknown stored values fall back to the OS color scheme.
 * @returns {Promise<void>} Resolves after the active theme is initialized.
 */
export const initTheme = async() =>
{
    const theme = await getValue('App.Theme');

    if (theme === 'light' || theme === 'dark')
    {
        apply(theme);

        return;
    }

    apply(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
};
