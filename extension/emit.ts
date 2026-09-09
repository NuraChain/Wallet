import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { buildManifest, type Target } from './manifest.ts';

const targets: Target[] = ['chrome', 'edge', 'firefox', 'safari'];

/**
 * The four bundles land in one directory; each store gets its own copy of it with the manifest
 * that store understands. The popup's HTML comes out under the path Vite built it from and the
 * manifest names it at the root, so it moves up on the way in — its asset URLs are absolute and
 * do not care where the document itself sits.
 */
export const emitTargets = async (input: { build: string; out: string }) => {
    const popup = await readFile(`${input.build}/extension/popup.html`, 'utf8');

    const write = async (target: Target) => {
        const directory = `${input.out}/${target}`;

        await rm(directory, { recursive: true, force: true });
        await mkdir(directory, { recursive: true });

        await cp(input.build, directory, { recursive: true });
        await rm(`${directory}/extension`, { recursive: true, force: true });

        await writeFile(`${directory}/popup.html`, popup);

        await cp('extension/icon', `${directory}/icon`, { recursive: true });

        await writeFile(`${directory}/manifest.json`, `${JSON.stringify(buildManifest(target), undefined, 4)}\n`);
    };

    await Promise.all(targets.map(async (target) => write(target)));

    return targets;
};
