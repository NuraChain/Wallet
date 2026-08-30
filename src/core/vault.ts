import WalletManager from './wallet';

export type VaultKind = 'mnemonic' | 'privateKey';

export interface Vault {
    kind: VaultKind;
    secret: string;
}

const privateKeyShape = /^(?:0x)?[0-9a-fA-F]{64}$/u;

export const readVault = (secret: string): Vault => {
    const trimmed = secret.trim();

    return { kind: privateKeyShape.test(trimmed) ? 'privateKey' : 'mnemonic', secret: trimmed };
};

export const vaultManager = (vault: Vault, index: number) =>
    vault.kind === 'privateKey' ? WalletManager.FromPrivateKey(vault.secret) : new WalletManager(vault.secret, index);

export const vaultAddress = (vault: Vault, index: number) => vaultManager(vault, index).retrieve().Public;

export const vaultDerivable = (vault: Vault) => vault.kind === 'mnemonic';
