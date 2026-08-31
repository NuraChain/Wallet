# Nura Wallet connector

Lets a dApp's connect modal list **Nura Wallet** in any browser.

## Inside the wallet's browser tab

Nothing to do. The wallet injects a full EIP-1193 provider and announces it through
EIP-6963, so wagmi v2 / RainbowKit / AppKit discover it automatically.

## In an external browser (Chrome, Safari, Android)

No wallet can inject a provider into a browser it does not own. Ship this file with the
site instead:

```html
<script src="/nura-connector.js"></script>
<script>NuraConnector.init({ chainId: 1020 });</script>
```

`init` announces a "Nura Wallet" EIP-6963 provider whose requests travel over the
`nurawallet://` deep link. Signing and transactions open the wallet app; the wallet
answers by reopening the site with the result in the URL fragment, which the connector
forwards to the waiting tab over BroadcastChannel (localStorage fallback) and then
cleans from the URL.

Options: `chainId` (default 1020), `icon` (data URI shown in the modal).

Notes:

- The answer arrives in a new tab of the site; the original tab resolves through the
  channel. The extra tab shows the page as normal.
- `eth_chainId`, `net_version` and `eth_accounts` answer locally; account grants are
  cached in localStorage after the first `eth_requestAccounts`.
- Requires the wallet app to be installed; if the deep link goes unanswered the request
  rejects with code 4001 after five minutes.
