import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { buildManifest } from './manifest.ts';
import type { Target } from '../src/type/extension.ts';

const targets: Target[] = ['chrome', 'edge', 'firefox', 'safari'];

const documents = ['popup.html', 'sidepanel.html'];

// The HTML moves up to the root the manifest names; its asset URLs are absolute, so that is safe.
export const emitTargets = async (input: { build: string; out: string }) => {
    const html = await Promise.all(documents.map(async (name) => readFile(`${input.build}/src-extension/${name}`, 'utf8')));

    const write = async (target: Target) => {
        const directory = `${input.out}/${target}`;

        await rm(directory, { recursive: true, force: true });
        await mkdir(directory, { recursive: true });

        await cp(input.build, directory, { recursive: true });
        await rm(`${directory}/src-extension`, { recursive: true, force: true });

        await Promise.all(documents.map(async (name, index) => writeFile(`${directory}/${name}`, html[index] ?? '')));

        await cp('src-extension/icon', `${directory}/icon`, { recursive: true });

        await writeFile(`${directory}/manifest.json`, `${JSON.stringify(buildManifest(target), undefined, 4)}\n`);
    };

    await Promise.all(targets.map(async (target) => write(target)));

    return targets;
};
