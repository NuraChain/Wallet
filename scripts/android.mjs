import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * `tauri android dev` has to tell the phone where the dev server lives, and with no host configured
 * it picks one by walking this machine's network interfaces. On a Windows box carrying Docker, WSL,
 * Hyper-V or VirtualBox adapters it regularly lands on one of their virtual addresses — 172.x or
 * 192.168.56.x — which the phone cannot route to, so the webview opens an unreachable URL and the
 * app comes up blank.
 *
 * The cable is already attached, so the ports go over it instead: `adb reverse` maps the phone's own
 * localhost back to this machine. That fixes the address for good and sidesteps the firewall too —
 * the dev server only ever listens on loopback and never has to accept a connection off the network,
 * which matters here because Windows files the Ethernet link as a Public network and blocks inbound
 * traffic on it by default.
 */

// 1420 serves the app; 1421 carries Vite's HMR socket. Both are pinned in vite.config.ts.
const ports = [1420, 1421];

const host = '127.0.0.1';

const findAdb = () => {
    const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter((root) => typeof root === 'string' && root.length > 0);

    for (const root of roots) {
        const candidate = join(root, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');

        if (existsSync(candidate)) {
            return candidate;
        }
    }

    // Not under the SDK we know about, but it may still be on PATH.
    return process.platform === 'win32' ? 'adb.exe' : 'adb';
};

const listDevices = (adb) => {
    const output = execFileSync(adb, ['devices'], { encoding: 'utf8' });

    return output
        .split('\n')
        .slice(1)
        .map((line) => line.trim().split(/\s+/u))
        .filter((parts) => parts.length >= 2 && parts[1] === 'device')
        .map((parts) => parts[0]);
};

const adb = findAdb();

let devices = [];

try {
    devices = listDevices(adb);
} catch {
    console.error(`Could not run adb (${adb}). Install the platform-tools package, or put adb on PATH.`);

    process.exit(1);
}

if (devices.length === 0) {
    console.error('No device is connected. Plug the phone in over USB, enable USB debugging, and accept the pairing prompt.');
    console.error('Running over Wi-Fi instead means setting TAURI_DEV_HOST to this machine’s LAN address and opening ports 1420 and 1421 in the firewall.');

    process.exit(1);
}

// ANDROID_SERIAL is what adb itself reads, so honour it before falling back to the only device.
const serial = process.env.ANDROID_SERIAL ?? devices[0];

if (devices.length > 1 && process.env.ANDROID_SERIAL === undefined) {
    console.warn(`More than one device is attached (${devices.join(', ')}); using ${serial}. Set ANDROID_SERIAL to choose another.`);
}

for (const port of ports) {
    execFileSync(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'inherit' });
}

console.log(`Forwarded ports ${ports.join(' and ')} to ${serial} over USB; the dev server stays on ${host}.`);

const tauri = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');

const child = spawn(process.execPath, [tauri, 'android', 'dev', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, TAURI_DEV_HOST: host }
});

child.on('exit', (code, signal) => {
    // The reverse rules belong to this run; leaving them behind would shadow another project's ports.
    for (const port of ports) {
        try {
            execFileSync(adb, ['-s', serial, 'reverse', '--remove', `tcp:${port}`], { stdio: 'ignore' });
        } catch {
            // The phone was unplugged, or adb already dropped the rule with the connection.
        }
    }

    process.exit(signal === null ? (code ?? 0) : 1);
});
