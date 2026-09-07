import { appVersion, manifestVersion } from './version';

export type Target = 'chrome' | 'firefox' | 'safari';

/**
 * The endpoints the wallet reaches on its own. Anything the user adds later — a custom chain's
 * RPC through `wallet_addEthereumChain` or the network form — is covered by the optional
 * wildcard instead, so the install prompt only ever names what the app ships with.
 */
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
    'https://raw.githubusercontent.com/*'
];

const pages = ['http://*/*', 'https://*/*'];

const icons = { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' };

/**
 * Only script-bearing directives are enforced on extension pages, and `default-src` counts as
 * their fallback — so it stays exactly 'self'. 'wasm-unsafe-eval' is not optional: hash-wasm
 * compiles the Argon2id that unlocks the vault, and without it the wallet cannot open at all.
 */
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

/**
 * `world: 'MAIN'` only landed in Chrome 111, Firefox 128 and Safari 18, and a browser that does
 * not know the key ignores the key rather than the entry — which would quietly run the provider
 * in the isolated world, where no page can see it. Only Chrome is told to inject that way; the
 * other two get the script tag the content script writes, guarded by the same sentinel.
 */
const contentScripts = (target: Target) => {
    const relay = {
        matches: pages,
        js: ['content.js'],
        world: 'ISOLATED',
        run_at: 'document_start',
        all_frames: true,
        match_about_blank: true
    };

    if (target !== 'chrome') {
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

    ...(target === 'chrome' ? { minimum_chrome_version: '111', version_name: appVersion } : {}),
    ...(target === 'safari' ? { version_name: appVersion } : {}),

    ...(target === 'firefox'
        ? {
              browser_specific_settings: {
                  gecko: {
                      id: 'wallet@nurachain.net',
                      strict_min_version: '115.0',

                      // AMO has refused new submissions without this since November 2025. The
                      // wallet hands an address to third-party RPC and price endpoints to read a
                      // balance, which is what the financial value covers.
                      data_collection_permissions: {
                          required: ['financialAndPaymentInfo'],
                          optional: ['websiteActivity']
                      }
                  }
              }
          }
        : {}),

    icons,

    action: { default_title: 'Nura Wallet', default_popup: 'popup.html', default_icon: icons },

    // Firefox has no extension service workers at all; MV3 there is a non-persistent event page.
    // `type: module` is what preserves top-level await on both.
    background: target === 'firefox' ? { scripts: ['background.js'], type: 'module' } : { service_worker: 'background.js', type: 'module' },

    content_scripts: contentScripts(target),

    web_accessible_resources: [
        {
            resources: ['inpage.js'],
            matches: pages,
            ...(target === 'chrome' ? { use_dynamic_url: true } : {})
        }
    ],

    permissions: ['storage', 'alarms'],

    host_permissions: knownHosts,

    optional_host_permissions: pages,

    content_security_policy: { extension_pages: policy }
});
