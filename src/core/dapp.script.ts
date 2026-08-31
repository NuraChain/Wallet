export interface DappIdentity {
    name: string;
    rdns: string;
    icon: string;
    chainId: string;
}

export const dappIdentity = (chainId: number): DappIdentity => ({
    name: 'Nura Wallet',
    rdns: 'net.nurachain.wallet',
    icon: __APP_ICON__,
    chainId: `0x${chainId.toString(16)}`
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

    var send = function (method, params)
    {
        return new Promise(function (resolve, reject)
        {
            counter += 1;

            var id = 'nura-' + String(counter) + '-' + newId();

            pending[id] = { resolve: resolve, reject: reject };

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

    // One uuid per entry, minted once: a modal keys its list on them and would otherwise grow a
    // duplicate row every time the page asks providers to announce themselves again.
    var announcements =
    [
        { uuid: newId(), name: IDENTITY.name, icon: IDENTITY.icon, rdns: IDENTITY.rdns },

        // Inside the wallet's own browser there is no other wallet to reach, so the rows a dApp
        // draws for the usual suspects all answer here rather than dead-ending on a deep link.
        { uuid: newId(), name: 'MetaMask', icon: IDENTITY.icon, rdns: 'io.metamask' },
        { uuid: newId(), name: 'Trust Wallet', icon: IDENTITY.icon, rdns: 'com.trustwallet.app' },
        { uuid: newId(), name: 'Coinbase Wallet', icon: IDENTITY.icon, rdns: 'com.coinbase.wallet' }
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
    var expose = function (name)
    {
        if (window[name] !== undefined) { return; }

        try
        {
            Object.defineProperty(window, name, { value: provider, writable: true, configurable: true, enumerable: true });
        }
        catch (ignored)
        {
            window[name] = provider;
        }
    };

    expose('ethereum');
    expose('trustwallet');
    expose('coinbaseWalletExtension');

    window.dispatchEvent(new Event('ethereum#initialized'));

    setTimeout(function ()
    {
        connected = true;

        emit('connect', { chainId: chainId });
    }, 0);
}());
`;
