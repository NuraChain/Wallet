import type { DappIdentity } from '../type/dapp';

export const dappIdentity = (chainId: number, channel: 'native' | 'extension' = 'native'): DappIdentity => ({
    name: 'Nura Wallet',
    rdns: 'net.nurachain.wallet',
    icon: __APP_ICON__,
    chainId: `0x${chainId.toString(16)}`,
    channel
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
            // '/' means this window's own origin, the only form that works on an opaque origin such as a sandboxed frame.
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

    // The asking page is not notified of its own new account, so it is read out of the answer.
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

        // Connect modals enable their MetaMask button off this flag. wagmi rejects it beside isTrust, isRabby and the like, so those stay off.
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

        // Tells the isolated world, which cannot see window.__nuraWallet, that the manifest already injected this.
        try { document.documentElement.setAttribute('data-nura-inpage', '1'); } catch (ignored) {  }
    }

    // Minted once: a modal keys its list on the uuid and would add a duplicate row on every re-announce.
    var announcements =
    [
        { uuid: newId(), name: IDENTITY.name, icon: IDENTITY.icon, rdns: IDENTITY.rdns },

        // No other wallet is reachable in the wallet's own browser, so these rows answer here instead of dead-ending on a deep link.
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

    // Connectors older than EIP-6963 sniff for a named global.
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

    // Binance's SDK reads only this object and otherwise hangs. window.BinanceChain stays unset: a page that finds it
    // signs through bnbSign() and reads the missing method as a refusal.
    expose('binancew3w', { ethereum: provider });

    window.dispatchEvent(new Event('ethereum#initialized'));

    var watchTheme = function ()
    {
        var probe;
        var told;
        var queued = false;

        var strip = function (text)
        {
            var blank = ' \\t\\n\\f\\r';
            var from = 0;
            var to = text.length;

            while (from < to && blank.indexOf(text.charAt(from)) !== -1) { from += 1; }
            while (to > from && blank.indexOf(text.charAt(to - 1)) !== -1) { to -= 1; }

            return text.slice(from, to);
        };

        // A canvas ignores a fill that is not a colour, so only a colour gives the same fill over two different starts.
        var parse = function (text)
        {
            if (probe === undefined)
            {
                var canvas = document.createElement('canvas');

                canvas.width = 1;
                canvas.height = 1;

                probe = canvas.getContext('2d') || null;
            }

            if (probe === null || text.length === 0) { return null; }

            probe.fillStyle = '#000001';
            probe.fillStyle = text;

            var first = probe.fillStyle;

            probe.fillStyle = '#000002';
            probe.fillStyle = text;

            if (probe.fillStyle !== first) { return null; }

            probe.clearRect(0, 0, 1, 1);
            probe.fillRect(0, 0, 1, 1);

            var dot = probe.getImageData(0, 0, 1, 1).data;

            if (dot[3] === 0) { return null; }

            return '#' + ((1 << 24) + (dot[0] << 16) + (dot[1] << 8) + dot[2]).toString(16).slice(1);
        };

        var read = function ()
        {
            var list = document.getElementsByTagName('meta');

            for (var index = 0; index < list.length; index += 1)
            {
                var name = list[index].getAttribute('name');
                var content = list[index].getAttribute('content');

                if (name === null || content === null || name.toLowerCase() !== 'theme-color') { continue; }

                var media = list[index].getAttribute('media');

                if (media !== null && !window.matchMedia(media).matches) { continue; }

                var color = parse(strip(content));

                if (color !== null) { return color; }
            }

            return null;
        };

        var tell = function ()
        {
            queued = false;

            var color;

            try { color = read(); } catch (ignored) { color = null; }

            // A loading page may still add the tag; clearing now would flash the last page's colour off and back on.
            if (color === null && document.readyState === 'loading') { return; }

            if (color === told) { return; }

            told = color;

            try { transport(JSON.stringify({ id: 'nura-theme-' + newId(), method: 'nura_themeColor', params: [color] }), ''); }
            catch (ignored) {  }
        };

        var look = function ()
        {
            if (queued) { return; }

            queued = true;

            setTimeout(tell, 50);
        };

        var watcher = typeof MutationObserver === 'function' ? new MutationObserver(look) : null;

        // After load only the head is watched, so a page rewriting its body does not trigger a lookup per change.
        var settle = function ()
        {
            look();

            if (watcher === null) { return; }

            watcher.disconnect();

            watcher.observe(document.head || document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['name', 'content', 'media']
            });
        };

        if (document.readyState === 'loading')
        {
            if (watcher !== null) { watcher.observe(document, { childList: true, subtree: true }); }

            document.addEventListener('DOMContentLoaded', settle);
        }
        else
        {
            settle();
        }

        // What a media attribute is measured against can change under a page that changes nothing.
        var scheme = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

        if (scheme !== null && typeof scheme.addEventListener === 'function') { scheme.addEventListener('change', look); }
        else if (scheme !== null && typeof scheme.addListener === 'function') { scheme.addListener(look); }

        window.addEventListener('resize', look);

        // A page restored from the back-forward cache reruns nothing, so the colour is told again.
        window.addEventListener('pageshow', function (event)
        {
            if (event && event.persisted) { told = undefined; look(); }
        });
    };

    // Top page only, and only in the wallet's own browser: an extension draws no chrome to colour.
    if (IDENTITY.channel === 'native' && typeof document !== 'undefined' && window.top === window)
    {
        try { watchTheme(); } catch (ignored) {  }
    }

    // A WebView on a phone has no notifications of its own, so they are asked of the wallet, which shows only
    // those a site's favourite allows. Offered to the top page alone, though a frame on the same transport is
    // stamped with the page's origin as its provider calls are.
    var shimNotices = function ()
    {
        var standing = 'default';
        var asking = null;

        var ask = function ()
        {
            if (asking === null)
            {
                asking = send('nura_notifyPermission', []).then(function (answer)
                {
                    standing = answer === 'granted' ? 'granted' : 'default';

                    return standing;
                }, function ()
                {
                    return standing;
                });

                asking.then(function () { asking = null; });
            }

            return asking;
        };

        var Notice = function Notification(title, options)
        {
            if (!(this instanceof Notice)) { throw new TypeError("Failed to construct 'Notification': Please use the 'new' operator."); }

            var self = this;
            var heard = {};

            self.title = String(title);
            self.body = options && typeof options.body === 'string' ? options.body : '';
            self.tag = options && typeof options.tag === 'string' ? options.tag : '';
            self.data = options ? options.data : undefined;
            self.onshow = null;
            self.onerror = null;
            self.onclick = null;
            self.onclose = null;

            self.addEventListener = function (name, handler)
            {
                (heard[name] = heard[name] || []).push(handler);
            };

            self.removeEventListener = function (name, handler)
            {
                heard[name] = (heard[name] || []).filter(function (item) { return item !== handler; });
            };

            var fire = function (name)
            {
                var event = { type: name, target: self };

                if (typeof self['on' + name] === 'function') { try { self['on' + name](event); } catch (ignored) {  } }

                (heard[name] || []).forEach(function (handler) { try { handler.call(self, event); } catch (ignored) {  } });
            };

            send('nura_notify', [{ title: self.title, body: self.body }]).then(function () { fire('show'); }, function () { fire('error'); });
        };

        Notice.prototype.close = function () {};

        Object.defineProperty(Notice, 'permission', { get: function () { return standing; } });

        Notice.maxActions = 0;

        Notice.requestPermission = function (callback)
        {
            var answer = ask();

            if (typeof callback === 'function') { answer.then(callback); }

            return answer;
        };

        try { Object.defineProperty(window, 'Notification', { value: Notice, writable: true, configurable: true }); }
        catch (ignored) { window.Notification = Notice; }

        // Shown from the page through a worker's registration; a push to the worker itself has no service to come from.
        var Registration = window.ServiceWorkerRegistration;

        if (typeof Registration === 'function' && Registration.prototype)
        {
            Registration.prototype.showNotification = function (title, options)
            {
                return send('nura_notify', [{ title: String(title), body: options && typeof options.body === 'string' ? options.body : '' }]).then(function () { return undefined; });
            };
        }

        // Learnt at once, so a page that reads the permission before asking finds it right.
        ask();
    };

    if (IDENTITY.channel === 'native' && window.top === window)
    {
        try { shimNotices(); } catch (ignored) {  }
    }

    setTimeout(function ()
    {
        connected = true;

        emit('connect', { chainId: chainId });
    }, 0);
}());
`;
