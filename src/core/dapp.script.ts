/**
 * What the injected script needs to know about the wallet before it can answer anything.
 *
 * All four `info` fields are EIP-6963's, and all four are checked by dApps: `rdns` has to be a valid
 * RFC-1034 domain name in reverse notation, `icon` has to be an RFC-2397 data URI, and `name` is what
 * the user picks the wallet out of a list by. `uuid` is the one field not here — the spec wants it
 * fresh per provider session, so the script mints it rather than being handed one that would repeat
 * across every page a tab visits.
 *
 * `chainId` is the chain the wallet is on at the moment the page is injected, in the hex form
 * EIP-695 requires. It exists so the legacy `ethereum.chainId` property has an answer before the
 * first round-trip has happened; everything that goes through `request` reads the live value instead.
 */
export interface DappIdentity { name: string; rdns: string; icon: string; chainId: string }

/**
 * How Nura names itself to a dApp, and the one place to change it.
 *
 * `rdns` is the field a dApp may reject the wallet over: EIP-6963 requires a valid RFC-1034 domain
 * name written in reverse, and it is also what a dApp keeps when it remembers which wallet the user
 * chose — so it has to be stable across releases and unique to this wallet. It is the reverse of
 * `wallet.nurachain.net`, the domain this project already identifies itself by: the Android package
 * name is that string, and the chain's own RPC and explorer live on `nurachain.net`.
 *
 * `name` is what the user actually picks from a list, so it is the product name and not the package.
 * @param {number} chainId The chain the wallet is on as the page is injected.
 * @returns {DappIdentity} The identity to announce.
 */
export const dappIdentity = (chainId: number): DappIdentity => ({
    name: 'Nura Wallet',
    rdns: 'net.nurachain.wallet',
    icon: __APP_ICON__,
    chainId: `0x${ chainId.toString(16) }`
});

/**
 * The script every page in the browser is given, before any of its own scripts run.
 *
 * This is the whole of Nura's presence inside a dApp: an EIP-1193 provider, the EIP-6963 announcement
 * that lets the page discover it without fighting over `window.ethereum`, and the transport that
 * carries a call back to the wallet. It is authored here, in one place, and handed to whichever native
 * side is doing the injecting — Rust passes it to `initialization_script`, Kotlin to
 * `WebViewCompat.addDocumentStartJavaScript` — so there is exactly one copy of this behaviour and
 * neither platform can drift from the other.
 *
 * It is written in ES5-flavoured JavaScript on purpose. It runs in whatever engine the page got, it is
 * never touched by the bundler, and it must not contain a backtick or a `${` sequence, since it is
 * built inside a template literal here.
 *
 * The two globals it installs, `__nuraWalletReply` and `__nuraWalletEvent`, are reachable by the page.
 * That is not a way in: a page calling them can only answer its own pending request or fake an event
 * to itself, and every decision that matters — which origin is asking, whether that origin is
 * connected, whether the user approved — is made in the wallet against an origin the page never gets
 * to state. The transport in the other direction is the one that carries authority, and it is the
 * native side that stamps it.
 * @param {DappIdentity} identity What to announce the wallet as, and the chain it is currently on.
 * @returns {string} The script text, ready to be injected at document start.
 */
export const dappScript = (identity: DappIdentity) => `
(function ()
{
    'use strict';

    if (window.__nuraWallet !== undefined) { return; }

    var IDENTITY = ${ JSON.stringify(identity) };

    var pending = {};
    var counter = 0;

    var chainId = IDENTITY.chainId;
    var accounts = [];
    var connected = false;

    /* A UUIDv4 for this provider session. crypto.randomUUID is missing on an insecure origin, which a
       plain http:// dApp is, so the bytes are drawn by hand there — getRandomValues is available in
       both contexts, unlike randomUUID. */
    var newId = function ()
    {
        if (window.crypto && typeof window.crypto.randomUUID === 'function')
        {
            try { return window.crypto.randomUUID(); } catch (ignored) { /* fall through */ }
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

    /* EIP-1193 wants a rejection carrying the numeric code, not a bare Error, and every dApp library
       reads .code to tell "the user closed the dialog" (4001) from a genuine failure. */
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

        /* Copied before iterating, because a listener is allowed to remove itself while it runs and a
           once() handler always does. */
        var copy = bucket.slice();

        for (var i = 0; i < copy.length; i += 1)
        {
            try { copy[i](payload); } catch (ignored) { /* a page throwing is the page's problem */ }
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

    /* Where a reply lands, whichever platform delivered it: Kotlin calls this global directly through
       evaluateJavascript, and the desktop transport feeds the value its invoke resolved with into the
       same door so there is one code path for both. */
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

    /* State the wallet pushes without being asked. It is applied to the cached properties before the
       event goes out, so a handler reading ethereum.chainId sees the value the event is announcing
       rather than the one it replaces. */
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

    /* The one way out of the page. Android hands the payload to a per-tab JavascriptInterface and the
       reply comes back through deliver(); desktop invokes a single Tauri command whose resolved value
       is that same reply. Anything else means the script is running somewhere it was not injected by
       the wallet, and the honest answer there is that there is no provider to talk to. */
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

    /* The three the wallet can answer without leaving the page, kept for the pre-1193 send() form
       below, which is synchronous and has nowhere to put a promise. */
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

        chainId: chainId,
        networkVersion: String(parseInt(chainId, 16)),
        selectedAddress: null,

        /* EIP-1193. Everything else on this object is a shim that ends up here. */
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

        /* Pre-1193, and still what a surprising number of deployed dApps reach for first. */
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

            /* The synchronous shape web3 0.x used. There is no way to make a round-trip answer it, so
               it is answered from the cached state or refused outright rather than returning a
               plausible-looking empty result the caller would treat as fact. */
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

            /* Batches are answered one call at a time and reassembled in order, since the wallet
               speaks in single requests and the ordering is what the caller indexes by. */
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

    /* EIP-6963. The detail is frozen because the spec says so and because the reason it says so is
       real: a dApp holds this object for the life of the page, and anything able to swap the provider
       out from under it after the user has picked a wallet is able to redirect every later request. */
    var announce = function ()
    {
        var detail = Object.freeze({
            info: Object.freeze({ uuid: newId(), name: IDENTITY.name, icon: IDENTITY.icon, rdns: IDENTITY.rdns }),
            provider: provider
        });

        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: detail }));
    };

    /* Both halves are required. A dApp that was already listening hears the announcement below; one
       that starts listening later asks, and this is what answers it. The listener stays for the life
       of the page, since a dApp is allowed to ask again at any point. */
    window.addEventListener('eip6963:requestProvider', announce);

    announce();

    /* Legacy discovery, which EIP-6963 exists to replace but does not remove. Defined only when the
       slot is free and left configurable, so a second wallet injected after this one can still take
       it — fighting over the property is the exact behaviour 6963 was written to end, and a dApp that
       supports 6963 never reads it anyway. */
    if (window.ethereum === undefined)
    {
        try
        {
            Object.defineProperty(window, 'ethereum', { value: provider, writable: true, configurable: true, enumerable: true });
        }
        catch (ignored)
        {
            window.ethereum = provider;
        }
    }

    window.dispatchEvent(new Event('ethereum#initialized'));

    /* The provider announces itself as connected once the page can hear it. EIP-1193 has connect
       meaning "the provider can serve requests on this chain", which is true from injection: the
       wallet is open and the chain is known. It is deferred by a tick so a listener attached in the
       page's first script still catches it. */
    setTimeout(function ()
    {
        connected = true;

        emit('connect', { chainId: chainId });
    }, 0);
}());
`;
