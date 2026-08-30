import { fetch as nativeFetch } from '@tauri-apps/plugin-http';

export const httpRequest = async (url: string, init?: RequestInit): Promise<Response> => nativeFetch(url, init);
