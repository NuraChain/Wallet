/**
 * The host the app runs on. Mirrors the plugin-os `Platform` union rather than importing it, so a
 * build with no Tauri in it — the browser extension — still has a name for where it is running.
 */
export type Host = 'linux' | 'macos' | 'ios' | 'freebsd' | 'dragonfly' | 'netbsd' | 'openbsd' | 'solaris' | 'android' | 'windows' | 'extension' | 'unknown';
