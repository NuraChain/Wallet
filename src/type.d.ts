// oxlint-disable-next-line @typescript-eslint/naming-convention
declare const __APP_VERSION__: string;

// oxlint-disable-next-line @typescript-eslint/naming-convention
declare const __APP_ICON__: string;

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
