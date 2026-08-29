/**
 * The app version, replaced with a literal at build time from `Cargo.toml`.
 *
 * Declared rather than imported because it is not a module: Vite substitutes the text before the
 * bundler ever sees an identifier here. See `define` in `vite.config.ts`.
 */
// Spelled the way a Vite `define` key conventionally is: the screaming snake case marks it as text
// substituted at build time rather than a value anything imports, which is worth more here than
// matching the naming rule for variables that actually exist at runtime.
// oxlint-disable-next-line @typescript-eslint/naming-convention
declare const __APP_VERSION__: string;

/**
 * The app logo as an RFC-2397 data URI, substituted at build time from `src/assets/image/logo.png`.
 *
 * Declared here beside the version and for the same reason: Vite replaces the text before the bundler
 * sees an identifier. It exists because EIP-6963 requires the icon a wallet announces itself with to
 * be a data URI rather than a URL — see `define` in `vite.config.ts`.
 */
// oxlint-disable-next-line @typescript-eslint/naming-convention
declare const __APP_ICON__: string;

/**
 * The build-mode flags Vite substitutes into the bundle.
 *
 * Declared here rather than by referencing `vite/client`, for the same reason the asset modules below
 * are hand-written: that package's types redeclare `*.css`, `*.png` and the rest, and pulling them in
 * would collide with the declarations this file already makes. Only what the app reads is declared —
 * `DEV` is `false` in a production build, which is what lets the development-only branches be dropped.
 */
interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
    readonly VITE_COVALENT_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare module '*.css' {
    const value: string;

    export default value;
}

declare module '*.png' {
    const value: string;

    export default value;
}

declare module '*.jpg' {
    const value: string;

    export default value;
}

declare module '*.svg' {
    const value: string;

    export default value;
}
