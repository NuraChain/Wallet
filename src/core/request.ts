import { platform } from '../platform';

export const httpRequest = async (url: string, init?: RequestInit): Promise<Response> => platform.fetch(url, init);
