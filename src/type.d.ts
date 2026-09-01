declare const __APP_VERSION__: string;

declare const __APP_ICON__: string;

interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;
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
