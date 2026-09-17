---
name: wallet-security
description: Use before touching anything that handles key material or the lock — the vault, a mnemonic or private key, the password, the unlocked session, encrypted storage, or the recovery-phrase export. Covers src/core/vault.ts, password.ts, session.ts, export.ts and utility/storage.ts, the Argon2id + AES-GCM shape, and the rules a secret path may not bend. Read this before adding a storage key, a log line near a secret, or a second way to read the phrase.
---

# Key material

This is a wallet. Everything else in the tree can ship a bug and cost a re-render; the files
below can ship a bug and cost somebody their funds. **Nothing here is refactored for
tidiness.** If a change to one of them is not fixing a stated problem, do not make it.

## The vault — `core/vault.ts`

```ts
type VaultKind = 'mnemonic' | 'privateKey';
interface Vault { kind: VaultKind; secret: string }
```

`readVault(secret)` classifies by shape alone — 64 hex characters, `0x` optional, is a
private key; anything else is treated as a mnemonic. There is no second signal and no user
toggle, so the regex `privateKeyShape` **is** the decision. Widening it changes what a
paste is interpreted as.

- `vaultManager(vault, index)` builds the `WalletManager` — derived at `index` for a
  mnemonic, `FromPrivateKey` for the other, which ignores the index because there is only
  ever one account.
- `vaultDerivable(vault)` is the one predicate the UI asks before offering to add an
  account. A private-key vault cannot grow one; screens gate on this, never on `kind`.

## Two different Argon2id uses — do not merge them

Both run m=65536, t=3, p=1, 32 bytes. They are not the same operation and the salts differ
on purpose.

| | `core/password.ts` | `utility/storage.ts` |
|---|---|---|
| Purpose | Is this the right password? | Encrypt a value under it |
| Salt | One constant, app-wide | 16 random bytes **per value** |
| Output | Hex digest in `Wallet.Password` | Non-extractable AES-GCM `CryptoKey` |

`passwordVerify` compares by XOR-accumulating every char code and testing the total once —
length first, then a full pass. **Keep it branch-free**; an early `return false` on the
first mismatch is a timing oracle. `passwordCheck` answers `'ok' | 'invalid' | 'missing'`,
and `'missing'` is a real state (no wallet yet), not an error.

`passwordIssue(password, confirm)` is the only place the 6–32 length rule lives.

## Encrypted storage — `utility/storage.ts`

`setValueEncrypted` / `getValueEncrypted` are the only way a secret reaches disk:
fresh 16-byte salt and 12-byte IV per write, Argon2id to a key `importKey` marks
non-extractable, AES-GCM, stored as base64 `{ salt, iv, cipher, kdf: 'argon2id' }`.

**`Wallet.Mnemonic` is written and read through these two functions and nothing else.**
`router.tsx` calls plain `getValue('Wallet.Mnemonic')` on purpose — it is testing that a
wallet *exists* to decide the landing route, and never decrypts it. Keep that distinction:
presence is public, content is not.

Keys are the `StorageKey` union in `utility/storage.key.ts`. It is split out so the platform
layer can name a key without importing the module that depends on it — add new keys there,
never a bare string.

## The session — `core/session.ts`

A module singleton plus a listener set. `getVault()` is **synchronous** because signing and
render paths call it; that only holds because `restoreSession()` is awaited exactly once per
context before anything reaches for it. Do not make `getVault` async to fix a call site.

Durability is the platform's problem, not this file's (see the `extension` skill): a Tauri
window keeps the vault in memory and loses it with the process; an extension worker is
evicted after ~30s idle, so the vault outlives it somewhere else and is taken away on a
deadline instead. `platform.session.watch` is how a second window — or a worker that just
locked — tells this module the vault changed.

`touchSession()` pushes the idle deadline out and is called on the user's own actions, not
on reads. Wiring it into a read loop silently makes the wallet never lock.

## Export — `core/export.ts`

`phraseToPng` paints the mnemonic onto a canvas and hands back bare base64. The words are in
a bitmap in memory and then in a file the user picked; the platform `exporter()` decides
where. Desktop uses the `fs` plugin, Android goes through MediaStore in Kotlin because no
WebView can reach it. Both answers are `''` on success and a reason on failure.

## Rules

1. **No secret in a log, ever** — not behind a flag, not in a `catch`. `dappLog` deliberately
   carries method, origin, id and code, and never a param. Match that.
2. **No secret in a component's state or a URL.** The phrase screen re-reads and re-decrypts
   on demand; it does not hold the words after the dialog closes.
3. **No new path to the phrase.** Reading it costs a password prompt every time. A "just
   this once" shortcut is the bug.
4. **Never weaken a KDF parameter** to make a test or a slow device faster. They are the
   product.
5. **Logout is a list, so keep it honest.** `dashboard.logout.tsx` removes exactly
   `Wallet.Mnemonic`, `Wallet.Password`, `Wallet.Name`, `Wallet.Accounts`, `Wallet.Active`
   and then invalidates the history and token caches. `Wallet.Tokens` and
   `Wallet.TokensHidden` survive it. A new `Wallet.*` key is a decision in that file the
   same commit it is introduced — listed, or deliberately left — not an omission.
6. A change in this directory says why in the commit body.
