import { appVersion, manifestVersion } from './version.ts';

export type Target = 'chrome' | 'edge' | 'firefox' | 'safari';

/** Edge is Chromium under a different store, and reads every key Chrome reads. */
const isChromium = (target: Target) => target === 'chrome' || target === 'edge';

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
 * in the isolated world, where no page can see it. Only the Chromium targets are told to inject
 * that way; the other two get the script tag the content script writes, guarded by the same
 * sentinel.
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

                      // The true floor for the keys below: optional_host_permissions landed in
                      // 128, and data_collection_permissions — which AMO now refuses a new
                      // submission without — in 140 on desktop and 142 on Android.
                      strict_min_version: '142.0',

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

    /**
     * No `default_popup` where there is a dock to open instead. A popup is dismissed the moment
     * the user clicks the page behind it, which is most of what anyone does with a wallet open, so
     * the button opens the panel: Chromium through `setPanelBehavior`, Gecko through the click
     * handler the worker registers. Safari has neither and keeps the popup.
     */
    action: {
        default_title: 'Nura Wallet',
        default_icon: icons,
        ...(target === 'safari' ? { default_popup: 'popup.html' } : {})
    },

    /**
     * The same wallet in a frame the browser keeps open. A popup is dismissed the moment the user
     * clicks the page behind it, which is most of what anyone does with a wallet open, so the
     * panel is the surface for watching a swap land or approving one call after another.
     *
     * Chromium docks it with `side_panel` and Gecko with `sidebar_action`; the two keys name the
     * same document. Safari has neither, and gets the popup alone.
     */
    ...(isChromium(target) ? { side_panel: { default_path: 'sidepanel.html' } } : {}),

    ...(target === 'firefox'
        ? {
              sidebar_action: {
                  default_panel: 'sidepanel.html',
                  default_title: 'Nura Wallet',
                  default_icon: icons,

                  // Nothing has been unlocked yet at install time, so opening on its own would
                  // only take up a third of the window to say so.
                  open_at_install: false
              }
          }
        : {}),

    // Firefox has no extension service workers at all; MV3 there is a non-persistent event page.
    // `type: module` is what preserves top-level await on both.
    background: target === 'firefox' ? { scripts: ['background.js'], type: 'module' } : { service_worker: 'background.js', type: 'module' },

    content_scripts: contentScripts(target),

    web_accessible_resources: [
        {
            resources: ['inpage.js'],
            matches: pages,
            ...(isChromium(target) ? { use_dynamic_url: true } : {})
        }
    ],

    // sidePanel is the Chromium-only half of the pair above: `sidebar_action` needs no permission
    // of its own, and Safari has nothing to ask for.
    permissions: isChromium(target) ? ['storage', 'alarms', 'sidePanel'] : ['storage', 'alarms'],

    host_permissions: knownHosts,

    optional_host_permissions: pages,

    content_security_policy: { extension_pages: policy }
});
