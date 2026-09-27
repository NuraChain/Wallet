import { readFileSync } from 'node:fs';

const declared = /^version\s*=\s*"(?<semver>[^"]+)"/mu.exec(readFileSync('src-tauri/Cargo.toml', 'utf8'))?.groups?.semver;

/**
 * What `__APP_VERSION__` carries: the whole string, prerelease and all. Cargo.toml stays the one
 * place a version is written, because the release workflow already checks the tag against it.
 */
export const appVersion = declared ?? '0.0.0';

/**
 * What a manifest carries. Every store accepts one to four dot-separated integers and nothing
 * else, so a prerelease like 1.4.0-rc.1 has to be cut down to 1.4.0; the full string survives
 * beside it in `version_name`, which is only ever displayed.
 */
export const manifestVersion = appVersion.split(/[-+]/u)[0] ?? '0.0.0';
