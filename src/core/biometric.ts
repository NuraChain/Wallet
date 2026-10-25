import { platform } from '../platform';
import { readVault } from './vault';
import { passwordCheck } from './password';
import { unlockSession } from './session';
import { getValue, getValueEncrypted, removeValue, setValue } from '../utility/storage';
import type { BiometricFailure, BiometricKind } from '../type/platform';

/*
 * Biometric unlock keeps a copy of the wallet password behind the device's biometrics (see PlatformBiometric) and, once a
 * face or finger releases it, unlocks exactly as the typed password would. It opens the session and nothing more: the
 * recovery phrase and deleting the wallet still ask for the password typed.
 */

const failures = new Set<string>(['cancel', 'gone', 'unavailable', 'failed']);

const failureOf = (cause: unknown): BiometricFailure =>
    cause instanceof Error && failures.has(cause.message) ? (cause.message as BiometricFailure) : 'failed';

/** Undefined where biometric unlock cannot be offered. */
export const biometricKind = async (): Promise<BiometricKind | undefined> => platform.biometric.kind().catch(() => undefined);

export const biometricEnabled = async () => ((await getValue('Wallet.Biometric').catch(() => undefined)) ?? '').length > 0;

export const disableBiometric = async () => {
    await removeValue('Wallet.Biometric');

    await platform.biometric.forget().catch(() => undefined);
};

/** Only with the password typed and checked: a copy is never made from anything but the real one. */
export const enableBiometric = async (password: string, prompt: string): Promise<'ok' | 'invalid' | BiometricFailure> => {
    if ((await passwordCheck(password)) !== 'ok') {
        return 'invalid';
    }

    try {
        await setValue('Wallet.Biometric', await platform.biometric.seal(password, prompt));

        return 'ok';
    } catch (cause) {
        return failureOf(cause);
    }
};

export type BiometricUnlock = 'ok' | 'off' | BiometricFailure;

/**
 * `cancel` and `failed` leave biometric unlock on, to be tried again; `gone`, `unavailable` and a copy that no longer opens
 * the wallet turn it off, so the password is asked for from then on. The password goes from the system's answer to the vault
 * and is held nowhere else.
 */
export const unlockWithBiometric = async (prompt: string): Promise<BiometricUnlock> => {
    const sealed = (await getValue('Wallet.Biometric').catch(() => undefined)) ?? '';

    if (sealed.length === 0) {
        return 'off';
    }

    let password: string;

    try {
        password = await platform.biometric.open(sealed, prompt);
    } catch (cause) {
        const failure = failureOf(cause);

        if (failure === 'gone' || failure === 'unavailable') {
            await disableBiometric();
        }

        return failure;
    }

    const outcome = await passwordCheck(password);

    if (outcome === 'missing') {
        await disableBiometric();

        return 'off';
    }

    if (outcome === 'invalid') {
        await disableBiometric();

        return 'gone';
    }

    const secret = await getValueEncrypted('Wallet.Mnemonic', password).catch(() => undefined);

    if (secret === undefined) {
        return 'failed';
    }

    unlockSession(readVault(secret));

    return 'ok';
};
