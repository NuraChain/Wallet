#!/usr/bin/env node
/**
 * Drives Nura Wallet over the Chrome DevTools Protocol, with nothing to install: Node's global
 * WebSocket speaks CDP, and the browser is whatever Chromium is already on the machine.
 *
 * Two targets:
 *  - web (default): the Vite dev server in a headless Chromium, with the Tauri IPC faked in the
 *    page (an in-memory store, a platform name) so every screen renders without Rust.
 *  - --attach <port>: the real Tauri window, started with WebView2's remote-debugging port. Real
 *    IPC, real storage — the profile on disk is the one the installed app uses.
 *  - --extension <dir>: an unpacked build (dist-extension/chrome) loaded into Playwright's Chromium,
 *    with --page picking the document (default sidepanel.html?window).
 *
 * Steps run in order in one page:
 *   unlock | route:/path | prompt:<fixture> | clear | wait:<ms> | shot:<name>
 *   eval:<js> | click:<css> | fill:<css>=<value> | press:<button label> | text:<css>
 *   theme:<light|dark> | lang:<code>
 *
 * e.g. node .claude/skills/run-wallet/driver.mjs --lang fa unlock prompt:approve shot:approve-fa
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';

const options = { url: 'http://localhost:1420/', size: '360x640', theme: 'light', lang: 'en', platform: 'android', out: join(tmpdir(), 'nura-wallet-shots') };
const steps = [];

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--headed' || arg === '--keep') options[arg.slice(2)] = true;
    else if (arg.startsWith('--')) options[arg.slice(2)] = argv[++i];
    else steps.push(arg);
}

const log = (...parts) => console.log('[driver]', ...parts);

// ---------------------------------------------------------------- fixtures for prompt:<name>

const pad = (hex) => hex.replace(/^0x/u, '').toLowerCase().padStart(64, '0');
const usdt = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const spender = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const payee = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD';
const tx = (to, value, data, origin = 'https://app.uniswap.org') => ({ kind: 'transaction', origin, summary: value, transaction: { to, value, data, fee: '0.000071 Nura' } });

const fixtures = {
    send: tx(payee, '0.25 Nura', ''),
    approve: tx(usdt, '0.0 Nura', `0x095ea7b3${pad(spender)}${'f'.repeat(64)}`),
    revoke: tx(usdt, '0.0 Nura', `0x095ea7b3${pad(spender)}${'0'.repeat(64)}`, 'https://revoke.cash'),
    transfer: tx(usdt, '0.0 Nura', `0xa9059cbb${pad(payee)}${pad((125n * 10n ** 6n).toString(16))}`),
    insecure: tx(payee, '0.05 Nura', `0x3593564c${'0'.repeat(128)}`, 'http://xn--uniswp-9ra.org.claim-airdrop.io:8080'),
    sign: { kind: 'signature', origin: 'https://app.aave.com', summary: 'Sign in to app.aave.com\nNonce: 42' },
    typed: { kind: 'typed', origin: 'https://opensea.io', summary: JSON.stringify({ offerer: payee, startTime: '1727000000', counter: '0' }, null, 2) },
    connect: { kind: 'connect', origin: 'https://app.aave.com', summary: 'https://app.aave.com' },
    'chain-add': { kind: 'chain', origin: 'https://bridge.arbitrum.io', summary: 'Arbitrum One', chain: { name: 'Arbitrum One', id: 42161, rpc: 'https://arb1.arbitrum.io/rpc', added: true, from: { name: 'Nura Chain', id: 1020 } } },
    'chain-switch': { kind: 'chain', origin: 'https://pancakeswap.finance', summary: 'BNB Smart Chain', chain: { name: 'BNB Smart Chain', id: 56, rpc: 'https://bsc-dataseed.binance.org', added: false, from: { name: 'Nura Chain', id: 1020 } } },
    asset: { kind: 'asset', origin: 'https://pancakeswap.finance', summary: 'CAKE', asset: { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE', decimals: 18 } }
};

// ---------------------------------------------------------------- the fake Tauri IPC (web target)

/* Just enough of __TAURI_INTERNALS__ for the app to boot: plugin-store round-trips through a Map,
   plugin-os reads its platform off a global, event listens succeed and never fire. Anything else
   rejects, which is what the app already expects outside Tauri (balances show their error state). */
const mock = (seed, platform) => `
(() => {
    const store = new Map(Object.entries(${JSON.stringify(seed)}));
    let callback = 0;
    window.__TAURI_OS_PLUGIN_INTERNALS__ = { platform: ${JSON.stringify(platform)} };
    window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
        transformCallback: (fn) => { callback += 1; window['_' + callback] = fn; return callback; },
        unregisterCallback: () => {},
        invoke: async (cmd, args) => {
            if (cmd === 'plugin:store|load') return 1;
            if (cmd === 'plugin:store|get') return [store.get(args.key), store.has(args.key)];
            if (cmd === 'plugin:store|set') { store.set(args.key, args.value); return null; }
            if (cmd === 'plugin:store|delete') return store.delete(args.key);
            if (cmd === 'plugin:store|save') return null;
            if (cmd === 'plugin:event|listen') return 1;
            throw new Error('not faked by the driver: ' + cmd);
        }
    };
})();`;

// ---------------------------------------------------------------- CDP plumbing

const playwrightChromium = () => {
    const cache = process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? '', 'ms-playwright') : join(homedir(), '.cache', 'ms-playwright');
    const builds = existsSync(cache) ? readdirSync(cache).filter((name) => /^chromium-\d+$/u.test(name)).sort() : [];
    for (const build of builds.reverse()) {
        for (const exe of ['chrome-win/chrome.exe', 'chrome-win64/chrome.exe', 'chrome-linux/chrome']) {
            if (existsSync(join(cache, build, exe))) return join(cache, build, exe);
        }
    }
    return undefined;
};

const browserPath = () => {
    // Branded Chrome ignores --load-extension since v137; Playwright's Chromium still honours it.
    if (options.extension !== undefined && process.env.BROWSER === undefined) {
        const chromium = playwrightChromium();
        if (chromium !== undefined) return chromium;
    }

    const candidates = [
        process.env.BROWSER,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];
    const found = candidates.find((path) => path !== undefined && existsSync(path));
    if (found !== undefined) return found;

    // Playwright's own Chromium, if any Playwright install ever downloaded one.
    const chromium = playwrightChromium();
    if (chromium !== undefined) return chromium;
    throw new Error('no Chromium found; set BROWSER=/path/to/chrome');
};

const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const reachable = async (url) => fetch(url).then(() => true, () => false);

const until = async (label, check, timeout = 30000) => {
    const start = Date.now();
    for (;;) {
        const value = await check();
        if (value) return value;
        if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${label}`);
        await sleep(250);
    }
};

const connect = async (wsUrl) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const waiters = [];
    const listeners = [];
    let next = 0;

    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });

    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== undefined) {
            const slot = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) slot?.reject(new Error(message.error.message));
            else slot?.resolve(message.result);
            return;
        }
        for (const listener of listeners) {
            if (listener.method === message.method) listener.fn(message.params);
        }
        for (const waiter of [...waiters]) {
            if (waiter.method === message.method) {
                waiters.splice(waiters.indexOf(waiter), 1);
                waiter.resolve(message.params);
            }
        }
    });

    const send = async (method, params = {}) =>
        new Promise((resolve, reject) => {
            next += 1;
            pending.set(next, { resolve, reject });
            socket.send(JSON.stringify({ id: next, method, params }));
        });

    const once = async (method) => new Promise((resolve) => waiters.push({ method, resolve }));

    const on = (method, fn) => listeners.push({ method, fn });

    return { send, once, on, close: () => socket.close() };
};

// ---------------------------------------------------------------- the run

const cleanup = [];
const failures = [];

const main = async () => {
    mkdirSync(options.out, { recursive: true });

    let pageWs;

    if (options.attach !== undefined) {
        const port = options.attach;
        const targets = await until(`CDP on port ${port}`, async () => fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => undefined), 120000);
        const page = targets.find((t) => t.type === 'page' && /localhost|tauri/u.test(t.url));
        if (page === undefined) throw new Error(`no app page among: ${targets.map((t) => t.url).join(', ')}`);
        log('attached to', page.url);
        pageWs = page.webSocketDebuggerUrl;
    } else {
        if (options.extension === undefined && !(await reachable(options.url))) {
            log('starting the Vite dev server (npm run dev)');
            // npm is a .cmd on Windows, which Node will only spawn through a shell; cmd /c keeps the
            // arguments out of shell parsing (and off the DEP0190 warning) and taskkill /T reaps it.
            const server = process.platform === 'win32' ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev'], { stdio: 'ignore' }) : spawn('npm', ['run', 'dev'], { stdio: 'ignore' });
            if (options.keep !== true) cleanup.push(() => (process.platform === 'win32' ? execFileSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) : server.kill()));
            await until('the dev server', async () => reachable(options.url), 60000);
        }

        const profile = mkdtempSync(join(tmpdir(), 'nura-driver-'));
        const unpacked = options.extension === undefined ? [] : [`--disable-extensions-except=${resolve(options.extension)}`, `--load-extension=${resolve(options.extension)}`];
        const browser = spawn(browserPath(), [options.headed ? '' : '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', ...unpacked, 'about:blank'].filter(Boolean), { stdio: 'ignore' });
        cleanup.push(() => {
            browser.kill();
            // Chrome holds its profile for a moment after the kill, and on Windows a locked file
            // refuses deletion outright; a leftover temp profile is not worth failing the run over.
            setTimeout(() => {
                try {
                    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
                } catch {}
            }, 500);
        });

        const port = await until('DevToolsActivePort', async () => {
            const file = join(profile, 'DevToolsActivePort');
            return existsSync(file) ? readFileSync(file, 'utf8').split('\n')[0] : undefined;
        });
        const targets = await until('a page target', async () => fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => undefined));
        pageWs = targets.find((t) => t.type === 'page').webSocketDebuggerUrl;

        if (options.extension !== undefined) {
            // Chromium runs component extensions of its own, some with a background.js as well, so the
            // worker is picked by asking each one for its manifest name.
            const wanted = JSON.parse(readFileSync(join(options.extension, 'manifest.json'), 'utf8')).name;
            const worker = await until('the extension worker', async () => {
                const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => []);
                for (const target of list.filter((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'))) {
                    const probe = await connect(target.webSocketDebuggerUrl);
                    const answer = await probe.send('Runtime.evaluate', { expression: 'chrome.runtime.getManifest().name', returnByValue: true }).catch(() => undefined);
                    probe.close();
                    if (answer?.result?.value === wanted) return target;
                }
                return undefined;
            });
            // Not new URL().origin: Node reports a non-special scheme's origin as the string "null".
            options.url = `${/^chrome-extension:\/\/[a-p]+/u.exec(worker.url)[0]}/${options.page ?? 'sidepanel.html?window'}`;
            log('extension page', options.url);
        }
    }

    const cdp = await connect(pageWs);
    cleanup.push(() => cdp.close());

    // What the page itself complained about, printed if the run fails: the first thing to read
    // when a screen never renders.
    const complaints = [];
    cdp.on('Runtime.exceptionThrown', (p) => complaints.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`));
    cdp.on('Runtime.consoleAPICalled', (p) => {
        if (p.type === 'error') complaints.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    });
    failures.push(() => complaints.slice(-8).forEach((line) => console.error('[page]', line.slice(0, 400))));

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const evaluate = async (expression) => {
        const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        return result.result.value;
    };

    failures.push(async () => console.error('[page] state:', await evaluate(`location.href + ' | ' + document.readyState + ' | ' + (document.body?.innerHTML ?? '').slice(0, 300)`).catch((e) => e.message)));

    const [width, height] = options.size.split('x').map(Number);

    if (options.attach === undefined) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

        // The extension has chrome.storage and no Tauri at all, so only the web target is faked.
        if (options.extension === undefined) {
            const seed = { 'App.Language': options.lang, 'App.Theme': options.theme, ...(options.seed ? JSON.parse(readFileSync(options.seed, 'utf8')) : {}) };
            await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: mock(seed, options.platform) });
        }

        const loaded = cdp.once('Page.loadEventFired');
        await cdp.send('Page.navigate', { url: options.url });
        await loaded;
    }

    await until('the app to render', async () => evaluate(`document.querySelector('#root')?.childElementCount > 0`));
    await sleep(800);

    // Modules are imported by the same URL the app imported them under, so these are the app's own
    // instances, not copies — which is what lets a step unlock the wallet or raise a prompt. The
    // extension is a bundle with no module URLs, so there the steps stop at shot/eval/click/text.
    if (options.extension === undefined) await evaluate(`(async () => {
        const prompts = await import('/core/dapp.prompt.ts');
        window.__driver = {
            ask: (detail) => { void prompts.askDappPrompt(detail); },
            clear: () => { for (let p = prompts.getDappPrompt(); p; p = prompts.getDappPrompt()) prompts.resolveDappPrompt(p.id, false); }
        };
    })()`);

    for (const step of steps) {
        const at = step.indexOf(':');
        const verb = at === -1 ? step : step.slice(0, at);
        const arg = at === -1 ? '' : step.slice(at + 1);

        log(step.length > 80 ? `${step.slice(0, 80)}…` : step);

        if (verb === 'unlock') {
            // The real app reads and writes the installed app's own store; a test vault there would
            // have token discovery saving its finds into the user's real token list.
            if (options.attach !== undefined) throw new Error('unlock fakes a vault and is web-only; unlock the real app with its password');
            await evaluate(`(async () => {
                const session = await import('/core/session.ts');
                const { router } = await import('/router.tsx');
                session.unlockSession({ kind: 'mnemonic', secret: 'test test test test test test test test test test test junk' });
                await router.navigate('/dashboard');
            })()`);
            await sleep(1200);
        } else if (verb === 'route') {
            await evaluate(`import('/router.tsx').then(({ router }) => router.navigate(${JSON.stringify(arg)}))`);
            await sleep(800);
        } else if (verb === 'prompt') {
            const detail = fixtures[arg] ?? JSON.parse(arg);
            await evaluate(`window.__driver.clear()`);
            await sleep(400);
            await evaluate(`window.__driver.ask(${JSON.stringify(detail)})`);
            await sleep(800);
        } else if (verb === 'clear') {
            await evaluate(`window.__driver.clear()`);
            await sleep(400);
        } else if (verb === 'theme') {
            await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(arg)}`);
        } else if (verb === 'lang') {
            await evaluate(`import('/utility/language.ts').then((m) => m.setLanguage(${JSON.stringify(arg)}))`);
            await sleep(300);
        } else if (verb === 'wait') {
            await sleep(Number(arg));
        } else if (verb === 'click') {
            await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) throw new Error('no element: ' + ${JSON.stringify(arg)}); el.click(); })()`);
            await sleep(600);
        } else if (verb === 'fill') {
            // Every match gets the value: a password and its confirmation are two inputs under one
            // selector. React only sees a change made through the native setter plus an input event.
            const split = arg.indexOf('=');
            await evaluate(`(() => {
                const all = [...document.querySelectorAll(${JSON.stringify(arg.slice(0, split))})];
                if (all.length === 0) throw new Error('no element: ' + ${JSON.stringify(arg.slice(0, split))});
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                for (const el of all) { setter.call(el, ${JSON.stringify(arg.slice(split + 1))}); el.dispatchEvent(new Event('input', { bubbles: true })); }
            })()`);
            await sleep(300);
        } else if (verb === 'press') {
            await evaluate(`(() => {
                const label = ${JSON.stringify(arg)};
                const el = [...document.querySelectorAll('button, [role=button]')].find((b) => b.innerText.trim() === label || b.getAttribute('aria-label') === label);
                if (!el) throw new Error('no button labelled ' + label);
                el.click();
            })()`);
            await sleep(800);
        } else if (verb === 'text') {
            console.log(await evaluate(`document.querySelector(${JSON.stringify(arg)})?.innerText ?? '(no element)'`));
        } else if (verb === 'eval') {
            console.log(JSON.stringify(await evaluate(arg), null, 2));
        } else if (verb === 'shot') {
            const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
            const file = join(options.out, `${arg || 'shot'}.png`);
            writeFileSync(file, Buffer.from(data, 'base64'));
            log('saved', file);
        } else {
            throw new Error(`unknown step "${verb}"`);
        }
    }
};

main()
    .catch((error) => {
        console.error('[driver] failed:', error.message);
        process.exitCode = 1;
        return Promise.all(failures.map(async (report) => report()));
    })
    .finally(() => {
        for (const stop of cleanup.reverse()) {
            try {
                stop();
            } catch {}
        }
        setTimeout(() => process.exit(), 700);
    });
