import { readFileSync } from 'node:fs';

const declared = /^version\s*=\s*"(?<semver>[^"]+)"/mu.exec(readFileSync('src-tauri/Cargo.toml', 'utf8'))?.groups?.semver;

export const appVersion = declared ?? '0.0.0';

// Stores accept only one to four dot-separated integers; the full string goes in version_name.
export const manifestVersion = appVersion.split(/[-+]/u)[0] ?? '0.0.0';
