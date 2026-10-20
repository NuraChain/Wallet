import type { PageMessage } from '../src/type/extension';

export const providerChannel = 'nura:provider';

export const dockChannel = 'nura:dock';

export const isPageMessage = (value: unknown): value is PageMessage =>
    typeof value === 'object' && value !== null && '__nura' in value && typeof (value as PageMessage).__nura === 'string';
