import { appVersion, manifestVersion } from './version.ts';
import type { Target } from '../src/type/extension.ts';

const isChromium = (target: Target) => target === 'chrome' || target === 'edge';

// Only what the app ships with; user-added RPCs fall under the optional wildcard, keeping the install prompt small.
const knownHosts = [
    'https://rpc.nurachain.net/*',
    'https://explorer.nurachain.net/*',
    'https://ethereum.publicnode.com/*',
    'https://eth.drpc.org/*',
    'https://cloudflare-eth.com/*',
    'https://eth.llamarpc.com/*',
    'https://rpc.ankr.com/*',
    'https://bsc-dataseed.binance.org/*',
    'https://bsc-rpc.publicnode.com/*',
    'https://bsc.publicnode.com/*',
    'https://api.coingecko.com/*',
    'https://api.etherscan.io/*',
    'https://bscscan.com/*',
    'https://eth.blockscout.com/*',
    'https://raw.githubusercontent.com/*',
    'https://ashbringer.org/*'
];

const pages = ['http://*/*', 'https://*/*'];

const icons = { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' };

// default-src stays exactly 'self'. 'wasm-unsafe-eval' is required: hash-wasm compiles the Argon2id that unlocks the vault.
const policy = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "object-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'"
].join('; ');

// world: 'MAIN' for Chromium only: an older engine ignores the key, not the entry, and runs the provider isolated.
const contentScripts = (target: Target) => {
    const relay = {
        matches: pages,
        js: ['content.js'],
        world: 'ISOLATED',
        run_at: 'document_start',
        all_frames: true,
        match_about_blank: true
    };

    if (!isChromium(target)) {
        return [relay];
    }

    return [{ ...relay, js: ['inpage.js'], world: 'MAIN' }, relay];
};

export const buildManifest = (target: Target) => ({
    manifest_version: 3,
    name: 'Nura Wallet',
    short_name: 'Nura',
    description: 'A self-custodial wallet for Nura Chain, Ethereum and BNB Smart Chain.',
    version: manifestVersion,
    homepage_url: 'https://nurachain.net',

    ...(isChromium(target) ? { minimum_chrome_version: '116', version_name: appVersion } : {}),
    ...(target === 'safari' ? { version_name: appVersion } : {}),

    ...(target === 'firefox'
        ? {
              browser_specific_settings: {
                  gecko: {
                      id: 'wallet@nurachain.net',

                      // data_collection_permissions needs Firefox 140 on desktop, 142 on Android.
                      strict_min_version: '142.0',

                      // AMO requires this for new submissions; addresses go to third-party RPC and price endpoints.
                      data_collection_permissions: {
                          required: ['financialAndPaymentInfo'],
                          optional: ['websiteActivity']
                      }
                  }
              }
          }
        : {}),

    icons,

    // No popup where a dock exists: a popup closes as soon as the page behind it is clicked.
    action: {
        default_title: 'Nura Wallet',
        default_icon: icons,
        ...(target === 'safari' ? { default_popup: 'popup.html' } : {})
    },

    ...(isChromium(target) ? { side_panel: { default_path: 'sidepanel.html' } } : {}),

    ...(target === 'firefox'
        ? {
              sidebar_action: {
                  default_panel: 'sidepanel.html',
                  default_title: 'Nura Wallet',
                  default_icon: icons,

                  open_at_install: false
              }
          }
        : {}),

    // Firefox has no extension service workers, only an event page; type: module keeps top-level await on both.
    background: target === 'firefox' ? { scripts: ['background.js'], type: 'module' } : { service_worker: 'background.js', type: 'module' },

    content_scripts: contentScripts(target),

    web_accessible_resources: [
        {
            resources: ['inpage.js'],
            matches: pages,
            ...(isChromium(target) ? { use_dynamic_url: true } : {})
        }
    ],

    permissions: ['storage', 'alarms', ...(isChromium(target) ? ['sidePanel'] : []), ...(target === 'safari' ? [] : ['contextMenus'])],

    host_permissions: knownHosts,

    optional_host_permissions: pages,

    content_security_policy: { extension_pages: policy }
});
