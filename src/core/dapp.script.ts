export interface DappIdentity {
    name: string;
    rdns: string;
    icon: string;
    chainId: string;

    /** Which way back to the wallet the page has. Decided at build time, not sniffed. */
    channel?: 'native' | 'extension';

    /**
     * The secret that authorises the floating grip, minted per injection by the wallet.
     *
     * The grip has to live in the page's own DOM, because the page is an OS-level view stacked
     * above everything the wallet draws — no z-index reaches over it. Keeping the secret in this
     * closure, and installing before any of the page's own scripts, is what stops the page from
     * working the control itself. Absent means no grip.
     */
    grip?: string;
}

export const dappIdentity = (chainId: number, channel: 'native' | 'extension' = 'native', grip = ''): DappIdentity => ({
    name: 'Nura Wallet',
    rdns: 'net.nurachain.wallet',
    icon: __APP_ICON__,
    chainId: `0x${chainId.toString(16)}`,
    channel,
    ...(grip.length > 0 ? { grip } : {})
});

export const dappScript = (identity: DappIdentity) => `
(function ()
{
    'use strict';

    if (window.__nuraWallet !== undefined) { return; }

    var IDENTITY = ${JSON.stringify(identity)};

    var pending = {};
    var counter = 0;

    var chainId = IDENTITY.chainId;
    var accounts = [];
    var connected = false;

    var newId = function ()
    {
        if (window.crypto && typeof window.crypto.randomUUID === 'function')
        {
            try { return window.crypto.randomUUID(); } catch (ignored) {  }
        }

        var bytes = new Uint8Array(16);

        window.crypto.getRandomValues(bytes);

        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        var hex = '';

        for (var i = 0; i < 16; i += 1)
        {
            hex += (bytes[i] + 0x100).toString(16).slice(1);
        }

        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    };

    var providerError = function (code, message, data)
    {
        var error = new Error(message);

        error.code = code;
        error.name = 'ProviderRpcError';

        if (data !== undefined) { error.data = data; }

        return error;
    };

    var listeners = {};

    var emit = function (name, payload)
    {
        var bucket = listeners[name];

        if (bucket === undefined) { return; }

        var copy = bucket.slice();

        for (var i = 0; i < copy.length; i += 1)
        {
            try { copy[i](payload); } catch (ignored) {  }
        }
    };

    var addListener = function (name, handler)
    {
        if (typeof name !== 'string' || typeof handler !== 'function') { return provider; }

        if (listeners[name] === undefined) { listeners[name] = []; }

        listeners[name].push(handler);

        return provider;
    };

    var removeListener = function (name, handler)
    {
        var bucket = listeners[name];

        if (bucket === undefined) { return provider; }

        for (var i = bucket.length - 1; i >= 0; i -= 1)
        {
            if (bucket[i] === handler || bucket[i].__nuraOriginal === handler) { bucket.splice(i, 1); }
        }

        return provider;
    };

    var deliver = function (raw)
    {
        var reply;

        try { reply = typeof raw === 'string' ? JSON.parse(raw) : raw; }
        catch (ignored) { return; }

        if (reply === null || typeof reply !== 'object' || typeof reply.id !== 'string') { return; }

        var slot = pending[reply.id];

        if (slot === undefined) { return; }

        delete pending[reply.id];

        if (reply.error !== undefined && reply.error !== null)
        {
            slot.reject(providerError(reply.error.code, reply.error.message, reply.error.data));

            return;
        }

        slot.resolve(reply.result === undefined ? null : reply.result);
    };

    var receive = function (raw)
    {
        var notice;

        try { notice = typeof raw === 'string' ? JSON.parse(raw) : raw; }
        catch (ignored) { return; }

        if (notice === null || typeof notice !== 'object' || typeof notice.event !== 'string') { return; }

        if (notice.event === 'accountsChanged')
        {
            accounts = Array.isArray(notice.payload) ? notice.payload : [];

            provider.selectedAddress = accounts.length > 0 ? accounts[0] : null;

            emit('accountsChanged', accounts);

            return;
        }

        if (notice.event === 'chainChanged')
        {
            chainId = typeof notice.payload === 'string' ? notice.payload : chainId;

            provider.chainId = chainId;
            provider.networkVersion = String(parseInt(chainId, 16));

            emit('chainChanged', chainId);

            return;
        }

        if (notice.event === 'connect')
        {
            connected = true;

            emit('connect', { chainId: chainId });

            return;
        }

        if (notice.event === 'disconnect')
        {
            connected = false;

            emit('disconnect', providerError(4900, 'Nura Wallet is disconnected'));

            return;
        }

        emit(notice.event, notice.payload);
    };

    var transport = function (body, id)
    {
        if (IDENTITY.channel === 'extension')
        {
            // '/' rather than an origin string: it means "this window's own origin" and is the
            // only form that works on a page with an opaque origin, such as a sandboxed frame.
            window.postMessage({ __nura: 'request', payload: body }, '/');

            return;
        }

        var android = window.__nuraEthereum;

        if (android !== undefined && typeof android.request === 'function')
        {
            android.request(body);

            return;
        }

        var tauri = window.__TAURI_INTERNALS__;

        if (tauri !== undefined && typeof tauri.invoke === 'function')
        {
            tauri.invoke('dapp_request', { payload: body }).then(deliver, function (cause)
            {
                deliver({ id: id, error: { code: -32603, message: String(cause && cause.message ? cause.message : cause) } });
            });

            return;
        }

        deliver({ id: id, error: { code: 4900, message: 'Nura Wallet is not available on this page' } });
    };

    // The wallet notifies every other page of a new account, but not the one that asked — that
    // page has the answer in hand. It still has to be read out of the answer, or the page stays
    // connected while provider.selectedAddress and the synchronous send() both report nobody.
    var adopt = function (method, result)
    {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts')
        {
            var list = Array.isArray(result) ? result : [];

            var moved = list.length !== accounts.length || (list.length > 0 && list[0] !== accounts[0]);

            accounts = list;

            provider.selectedAddress = list.length > 0 ? list[0] : null;

            if (moved) { emit('accountsChanged', accounts); }

            return;
        }

        if (method === 'eth_chainId' && typeof result === 'string')
        {
            chainId = result;

            provider.chainId = result;
            provider.networkVersion = String(parseInt(result, 16));
        }
    };

    var send = function (method, params)
    {
        return new Promise(function (resolve, reject)
        {
            counter += 1;

            var id = 'nura-' + String(counter) + '-' + newId();

            pending[id] = {
                resolve: function (result) { adopt(method, result); resolve(result); },
                reject: reject
            };

            var body;

            try
            {
                body = JSON.stringify({ id: id, method: method, params: params });
            }
            catch (ignored)
            {
                delete pending[id];

                reject(providerError(-32602, 'Request parameters could not be serialized'));

                return;
            }

            try
            {
                transport(body, id);
            }
            catch (cause)
            {
                delete pending[id];

                reject(providerError(-32603, String(cause && cause.message ? cause.message : cause)));
            }
        });
    };

    var cached = function (method)
    {
        if (method === 'eth_accounts') { return accounts; }
        if (method === 'eth_coinbase') { return accounts.length > 0 ? accounts[0] : null; }
        if (method === 'net_version') { return String(parseInt(chainId, 16)); }
        if (method === 'eth_chainId') { return chainId; }

        return undefined;
    };

    var provider =
    {
        isNuraWallet: true,

        // A connect modal decides its 'MetaMask' button is usable by reading this flag off the
        // injected provider. Without it the page falls back to a deep link that leads out of our
        // own browser and nowhere. Only this one flag is set: wagmi rejects a provider that claims
        // isMetaMask alongside isTrust, isRabby and friends, so the siblings stay off.
        isMetaMask: true,

        _metamask: { isUnlocked: function () { return Promise.resolve(true); } },

        chainId: chainId,
        networkVersion: String(parseInt(chainId, 16)),
        selectedAddress: null,

        request: function (args)
        {
            if (args === null || typeof args !== 'object' || Array.isArray(args))
            {
                return Promise.reject(providerError(-32600, 'Expected a single object argument'));
            }

            if (typeof args.method !== 'string' || args.method.length === 0)
            {
                return Promise.reject(providerError(-32600, 'Expected a non-empty string method'));
            }

            var params = args.params;

            if (params === undefined || params === null) { params = []; }

            if (typeof params !== 'object')
            {
                return Promise.reject(providerError(-32602, 'Expected params to be an array or an object'));
            }

            return send(args.method, params);
        },

        enable: function ()
        {
            return send('eth_requestAccounts', []);
        },

        send: function (first, second)
        {
            if (typeof first === 'string')
            {
                return send(first, second === undefined ? [] : second);
            }

            if (first !== null && typeof first === 'object' && typeof second === 'function')
            {
                return provider.sendAsync(first, second);
            }

            if (first !== null && typeof first === 'object')
            {
                var value = cached(first.method);

                if (value === undefined) { throw providerError(4200, 'Nura Wallet cannot answer ' + String(first.method) + ' synchronously'); }

                return { id: first.id, jsonrpc: '2.0', result: value };
            }

            return Promise.reject(providerError(-32600, 'Unsupported send() call'));
        },

        sendAsync: function (payload, callback)
        {
            if (typeof callback !== 'function')
            {
                throw providerError(-32600, 'Expected a callback');
            }

            if (Array.isArray(payload))
            {
                Promise.all(payload.map(function (item)
                {
                    return send(item.method, item.params === undefined ? [] : item.params).then(function (result)
                    {
                        return { id: item.id, jsonrpc: '2.0', result: result };
                    }, function (cause)
                    {
                        return { id: item.id, jsonrpc: '2.0', error: { code: cause.code, message: cause.message } };
                    });
                })).then(function (results) { callback(null, results); }, function (cause) { callback(cause, null); });

                return;
            }

            if (payload === null || typeof payload !== 'object')
            {
                callback(providerError(-32600, 'Expected a request object'), null);

                return;
            }

            send(payload.method, payload.params === undefined ? [] : payload.params).then(function (result)
            {
                callback(null, { id: payload.id, jsonrpc: '2.0', result: result });
            }, function (cause)
            {
                callback(cause, null);
            });
        },

        isConnected: function () { return connected; },

        on: addListener,
        addListener: addListener,
        removeListener: removeListener,
        off: removeListener,

        once: function (name, handler)
        {
            if (typeof handler !== 'function') { return provider; }

            var wrapper = function (payload)
            {
                removeListener(name, wrapper);

                handler(payload);
            };

            wrapper.__nuraOriginal = handler;

            return addListener(name, wrapper);
        },

        removeAllListeners: function (name)
        {
            if (name === undefined) { listeners = {}; } else { delete listeners[name]; }

            return provider;
        }
    };

    window.__nuraWallet = provider;
    window.__nuraWalletReply = deliver;
    window.__nuraWalletEvent = receive;

    if (IDENTITY.channel === 'extension')
    {
        window.addEventListener('message', function (event)
        {
            if (event.source !== window || event.data === null || typeof event.data !== 'object') { return; }

            if (event.data.__nura === 'reply') { deliver(event.data.payload); }
            else if (event.data.__nura === 'event') { receive(event.data.payload); }
        });

        // Read from the isolated world, which cannot see window.__nuraWallet, to know the
        // manifest already injected us and a second script tag would only be parsed and thrown
        // away by the guard at the top of this file.
        try { document.documentElement.setAttribute('data-nura-inpage', '1'); } catch (ignored) {  }
    }

    // One uuid per entry, minted once: a modal keys its list on them and would otherwise grow a
    // duplicate row every time the page asks providers to announce themselves again.
    var announcements =
    [
        { uuid: newId(), name: IDENTITY.name, icon: IDENTITY.icon, rdns: IDENTITY.rdns },

        // Inside the wallet's own browser there is no other wallet to reach, so the rows a dApp
        // draws for the usual suspects all answer here rather than dead-ending on a deep link.
        { uuid: newId(), name: 'MetaMask', icon: IDENTITY.icon, rdns: 'io.metamask' },
        { uuid: newId(), name: 'Trust Wallet', icon: IDENTITY.icon, rdns: 'com.trustwallet.app' },
        { uuid: newId(), name: 'Coinbase Wallet', icon: IDENTITY.icon, rdns: 'com.coinbase.wallet' },
        { uuid: newId(), name: 'Binance Wallet', icon: IDENTITY.icon, rdns: 'com.binance.wallet' },
        { uuid: newId(), name: 'OKX Wallet', icon: IDENTITY.icon, rdns: 'com.okex.wallet' }
    ];

    var announce = function ()
    {
        for (var index = 0; index < announcements.length; index += 1)
        {
            var detail = Object.freeze({ info: Object.freeze(announcements[index]), provider: provider });

            window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: detail }));
        }
    };

    window.addEventListener('eip6963:requestProvider', announce);

    announce();

    // Connectors written before EIP-6963 sniff for a named global instead of listening.
    var expose = function (name, held)
    {
        if (window[name] !== undefined) { return; }

        var value = held === undefined ? provider : held;

        try
        {
            Object.defineProperty(window, name, { value: value, writable: true, configurable: true, enumerable: true });
        }
        catch (ignored)
        {
            window[name] = value;
        }
    };

    expose('ethereum');
    expose('trustwallet');
    expose('coinbaseWalletExtension');
    expose('okxwallet');

    // Binance's button runs its own SDK, which never looks at window.ethereum: it reads the
    // provider off the object its in-app browser installs, and otherwise waits forever on a phone
    // that is meant to confirm. So it gets an object of that shape. The old window.BinanceChain
    // global stays unset on purpose — a page that finds it signs through bnbSign() and reads the
    // missing method as a refusal rather than falling back to personal_sign.
    expose('binancew3w', { ethereum: provider });

    window.dispatchEvent(new Event('ethereum#initialized'));


    // The floating grip: the wallet's one control that has to be drawn by the page, because the
    // page is painted by a view sitting above everything the wallet renders.
    //
    // Nothing here may lean on the page's styles, so every rule is inline, and the visual sits in
    // an inner element: the outer one carries the drag translate, and animating that would drag
    // the whole gesture through a transition.
    var mountGrip = function ()
    {
        if (typeof IDENTITY.grip !== 'string' || IDENTITY.grip.length === 0) { return; }

        // Subframes get the provider too, and would otherwise each add a grip of their own.
        if (window.top !== window) { return; }

        if (document.getElementById('nura-grip') !== null) { return; }

        var size = 44;
        var edge = 16;

        var calm = false;

        try { calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch (ignored) {  }

        var box = document.createElement('div');

        box.id = 'nura-grip';
        box.setAttribute('role', 'button');
        box.setAttribute('tabindex', '0');
        box.setAttribute('aria-label', 'Nura Wallet');

        box.style.cssText = [
            'position:fixed',
            'top:auto',
            'left:auto',
            'right:' + edge + 'px',
            'bottom:' + edge + 'px',
            'width:' + size + 'px',
            'height:' + size + 'px',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'margin:0',
            'padding:0',
            'border:0',
            'background:transparent',
            'cursor:grab',
            'touch-action:none',
            'user-select:none',
            '-webkit-user-select:none',
            'z-index:2147483647'
        ].join(';');

        var rest = 'rgba(17,24,39,0.55)';
        var hot = 'rgba(17,24,39,0.78)';

        var skin = document.createElement('div');

        skin.setAttribute('aria-hidden', 'true');

        skin.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'width:100%',
            'height:100%',
            'border-radius:9999px',
            'border:1px solid rgba(255,255,255,0.28)',
            'background:' + rest,
            '-webkit-backdrop-filter:blur(12px)',
            'backdrop-filter:blur(12px)',
            'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
            'color:#ffffff',
            'transform:scale(1)',
            'opacity:0.5',
            calm ? '' : 'transition:transform 150ms ease,background-color 150ms ease,border-color 150ms ease,opacity 150ms ease'
        ].join(';');

        // The lucide astroid, inlined: an injected script cannot import the wallet's icon set, so
        // the path is copied rather than the component used.
        skin.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203"/></svg>';

        box.appendChild(skin);

        var place = { x: 0, y: 0 };
        var grab = { x: 0, y: 0 };

        var pointer = -1;
        var moved = false;
        var hover = false;
        var last = 0;

        // Half opacity at rest, whole while it is being used: it sits on top of somebody else's
        // page, so it stays out of the way until a pointer is actually on it. Touch has no hover,
        // which leaves it dimmed until the press — the behaviour it is modelled on.
        var skinTo = function (scale, fill)
        {
            var idle = fill === rest;

            skin.style.transform = calm ? 'scale(1)' : 'scale(' + scale + ')';
            skin.style.background = fill;
            skin.style.opacity = idle ? '0.5' : '1';
            skin.style.borderColor = idle ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.45)';
        };

        var settle = function ()
        {
            if (hover) { skinTo(1.08, hot); }
            else { skinTo(1, rest); }
        };

        var draw = function ()
        {
            box.style.transform = 'translate(' + place.x + 'px,' + place.y + 'px)';
        };

        // Kept inside the viewport on every move and on resize: this is the only way back out of
        // full screen, so it may never be dragged or reflowed somewhere it cannot be tapped.
        var clamp = function ()
        {
            var width = window.innerWidth || size;
            var height = window.innerHeight || size;

            var minX = edge + size - width;
            var minY = edge + size - height;

            if (place.x > 0) { place.x = 0; }
            if (place.y > 0) { place.y = 0; }
            if (place.x < minX) { place.x = minX; }
            if (place.y < minY) { place.y = minY; }
        };

        // Synthesised rather than fetched: a sound file would need a URL the page is willing to
        // load, and most sites' own CSP would refuse it. A gesture opened the context, so autoplay
        // policy has nothing to object to.
        var sound = null;

        var chirp = function (rising)
        {
            try
            {
                var Ctor = window.AudioContext || window.webkitAudioContext;

                if (Ctor === undefined) { return; }

                if (sound === null) { sound = new Ctor(); }

                if (sound.state === 'suspended') { sound.resume(); }

                var at = sound.currentTime;

                var osc = sound.createOscillator();
                var gain = sound.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(rising ? 620 : 880, at);
                osc.frequency.exponentialRampToValueAtTime(rising ? 940 : 460, at + 0.11);

                gain.gain.setValueAtTime(0.0001, at);
                gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);

                osc.connect(gain);
                gain.connect(sound.destination);

                osc.start(at);
                osc.stop(at + 0.2);
            }
            catch (ignored) {  }
        };

        var toggle = function ()
        {
            if (!calm)
            {
                skinTo(1.3, hot);

                setTimeout(settle, 170);
            }

            // The wallet answers with the mode it landed in, so the note is right even after an
            // Escape the grip never heard about.
            send('nura_chrome', [IDENTITY.grip]).then(function (state) { chirp(state === true); }, function () {  });
        };

        box.addEventListener('pointerenter', function ()
        {
            hover = true;

            settle();
        });

        box.addEventListener('pointerleave', function ()
        {
            hover = false;

            settle();
        });

        box.addEventListener('pointerdown', function (event)
        {
            pointer = event.pointerId;
            moved = false;

            grab.x = event.clientX - place.x;
            grab.y = event.clientY - place.y;

            box.style.cursor = 'grabbing';

            skinTo(0.92, hot);

            try { box.setPointerCapture(pointer); }
            catch (ignored) {  }

            event.preventDefault();
        });

        box.addEventListener('pointermove', function (event)
        {
            if (event.pointerId !== pointer) { return; }

            var x = event.clientX - grab.x;
            var y = event.clientY - grab.y;

            if (Math.abs(x - place.x) > 3 || Math.abs(y - place.y) > 3) { moved = true; }

            place.x = x;
            place.y = y;

            clamp();
            draw();
        });

        var release = function (event)
        {
            if (event.pointerId !== pointer) { return; }

            pointer = -1;

            box.style.cursor = 'grab';

            try { box.releasePointerCapture(event.pointerId); }
            catch (ignored) {  }

            if (moved) { settle(); return; }

            var now = Date.now();

            if (now - last < 400) { last = 0; toggle(); }
            else { last = now; settle(); }
        };

        box.addEventListener('pointerup', release);
        box.addEventListener('pointercancel', release);

        box.addEventListener('keydown', function (event)
        {
            if (event.key === 'Enter' || event.key === ' ')
            {
                event.preventDefault();

                toggle();
            }
        });

        window.addEventListener('resize', function () { clamp(); draw(); });

        var attach = function ()
        {
            if (document.body !== null) { document.body.appendChild(box); }
            else { document.documentElement.appendChild(box); }
        };

        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', attach); }
        else { attach(); }
    };

    mountGrip();

    setTimeout(function ()
    {
        connected = true;

        emit('connect', { chainId: chainId });
    }, 0);
}());
`;
