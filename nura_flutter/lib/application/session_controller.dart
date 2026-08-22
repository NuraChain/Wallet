import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/security/key_derivation.dart';
import '../core/security/vault_cipher.dart';
import '../data/storage/app_store.dart';
import '../data/storage/legacy_store.dart';
import '../domain/wallet/account.dart';
import '../domain/wallet/hd_wallet.dart';

/// Which of the three screens the app should be showing.
///
/// Derived from what is on disk and whether the vault is open, never navigated to directly. The
/// Tauri build enforced the same thing with a route guard that redirected before rendering; making
/// it a state means there is no route to reach by accident in the first place.
enum SessionStage {
  /// Reading storage. Distinct from [intro] so a slow disk never flashes the create-wallet screen at
  /// someone who already has a wallet.
  loading,

  /// No wallet on this device.
  intro,

  /// A wallet exists and is locked.
  locked,

  /// The vault is open.
  unlocked,
}

/// Why an unlock attempt failed.
enum UnlockFailure { wrongPassword, noWallet, corrupt }

/// Holds the unlocked vault, and nothing else does.
///
/// The decrypted secret lives here in memory for exactly as long as the app is unlocked, and is
/// never written anywhere. That is the same discipline the Tauri build kept, and it had a specific
/// reason: the secret used to travel as a React Router state value, which is serialised into
/// `history.state` and survives a reload. There is no equivalent trap in Flutter, but the rule holds
/// for the same underlying reason — a decrypted phrase belongs in one place that can be dropped.
///
/// [lock] drops the reference and notifies; there is no path that returns it without the passphrase.
class SessionController extends ChangeNotifier {
  SessionController(this._store, {VaultCipher? cipher})
    : _cipher = cipher ?? VaultCipher();

  final AppStore _store;
  final VaultCipher _cipher;

  SessionStage _stage = SessionStage.loading;
  Vault? _vault;

  /// The derivation index the dashboard is showing. Meaningless for a private-key wallet.
  int _account = 0;

  /// The accounts this wallet holds, read on unlock.
  ///
  /// Empty while locked: the list is a property of an open wallet, and holding it across a lock
  /// would leave a switcher on screen naming accounts whose addresses cannot be derived.
  AccountList _accounts = const AccountList(<Account>[]);

  SessionStage get stage => _stage;
  int get account => _account;

  /// The accounts this wallet holds, in index order.
  List<Account> get accounts => _accounts.accounts;

  /// The unlocked key material, or null when locked.
  ///
  /// Deliberately not exposed as a getter that could be captured and outlive [lock]: callers ask for
  /// what they need — an address, a signer — and the vault stays here.
  bool get isUnlocked => _vault != null;

  /// The address of the account currently in view.
  String? get address {
    final vault = _vault;

    return vault == null ? null : HdWallet.addressOf(vault, _account);
  }

  /// Whether this wallet can hold more than one account.
  bool get derivable => _vault?.derivable ?? false;

  /// The address of one account, or null when locked.
  ///
  /// Derived on demand rather than stored. An address is a pure function of the phrase and the
  /// index, so caching it would only create a second place for it to be wrong — and the switcher
  /// derives one for an index that does not exist yet, to show what is about to be added.
  String? addressOfAccount(int index) {
    final vault = _vault;

    return vault == null ? null : HdWallet.addressOf(vault, index);
  }

  /// Decides which screen to open on, from what is on disk.
  ///
  /// A wallet that is present but unreadable is reported as [locked], never as [intro]. The
  /// difference matters more than anything else in this class: opening on [intro] would invite the
  /// user to create a new wallet over the top of one whose file simply failed to parse.
  Future<void> restore() async {
    final hasWallet = _store.has(LegacyStore.keyMnemonic);

    _stage = hasWallet ? SessionStage.locked : SessionStage.intro;

    notifyListeners();
  }

  /// Opens the vault with the user's passphrase.
  ///
  /// The passphrase is checked by decrypting, not by comparing the stored hash. Those are different
  /// guarantees: a hash comparison proves someone typed the right thing, while a successful AES-GCM
  /// decryption proves the ciphertext is intact *and* the key is right. The stored hash exists for
  /// the Tauri build's own reasons and is left alone rather than trusted as the gate.
  Future<UnlockFailure?> unlock(String password) async {
    final raw = _store.getString(LegacyStore.keyMnemonic);

    if (raw == null || raw.isEmpty) {
      return UnlockFailure.noWallet;
    }

    final VaultPayload payload;

    try {
      payload = VaultPayload.fromJson(
        LegacyStore(<String, dynamic>{LegacyStore.keyMnemonic: raw})
            .encryptedVault!,
      );
    } on FormatException {
      return UnlockFailure.corrupt;
    }

    final String secret;

    try {
      secret = await _cipher.open(payload, password);
    } on VaultOpenException {
      return UnlockFailure.wrongPassword;
    }

    _vault = Vault.read(secret);
    _accounts = _readAccounts();
    _account = _readAccount();
    _stage = SessionStage.unlocked;

    notifyListeners();

    return null;
  }

  /// Records a wallet created or imported in the intro flow.
  Future<void> adopt(String secret, String password) async {
    final payload = await _cipher.seal(secret, password);

    await _store.setString(LegacyStore.keyMnemonic, _encodePayload(payload));

    // Written for compatibility: the Tauri build's unlock screen reads this hash, so a wallet
    // created here must still open there during the migration period.
    await _store.setString(
      LegacyStore.keyPassword,
      hashUnlockPassword(password),
    );

    _vault = Vault.read(secret);
    _accounts = _readAccounts();
    _account = 0;
    _stage = SessionStage.unlocked;

    notifyListeners();
  }

  /// Drops the decrypted secret. The stored wallet is untouched.
  void lock() {
    _vault = null;
    _accounts = const AccountList(<Account>[]);
    _stage = SessionStage.locked;

    notifyListeners();
  }

  /// Removes the wallet from this device entirely.
  ///
  /// Every key the wallet wrote goes in one write, so the store either still holds a wallet or holds
  /// none of it. A half-cleared store is a state no screen could interpret.
  Future<void> forget() async {
    await _store.removeAll(const <String>[
      LegacyStore.keyMnemonic,
      LegacyStore.keyPassword,
      LegacyStore.keyName,
      LegacyStore.keyAccounts,
      LegacyStore.keyActive,
    ]);

    _vault = null;
    _accounts = const AccountList(<Account>[]);
    _stage = SessionStage.intro;

    notifyListeners();
  }

  /// Switches which derived account the dashboard shows, creating it if it is new.
  ///
  /// Selecting an index the wallet has never opened is what creates it, so adding an account and
  /// switching to it are one call. There is nothing to generate — the index already names a key that
  /// the phrase has always implied — so a separate "create" step would only be a second way to
  /// arrive at the same list.
  Future<void> selectAccount(int index) async {
    if (!derivable || index < 0 || index >= Account.limit) {
      return;
    }

    final known = _accounts.has(index);

    if (_account == index && known) {
      return;
    }

    _account = index;

    if (!known) {
      _accounts = _accounts.add(index);
    }

    notifyListeners();

    // The active index is written before the list so a crash between the two leaves the wallet
    // pointing at an account it can still derive, rather than at one the list does not mention.
    await _store.setString(LegacyStore.keyActive, '$index');

    if (!known) {
      await _store.setString(LegacyStore.keyAccounts, _accounts.encode());
    }
  }

  /// Renames one account, or clears the name back to its localised default.
  ///
  /// A blank name is stored as blank rather than refused: it is how a user undoes a label they no
  /// longer want, and the display side already falls back to "Account N".
  Future<void> renameAccount(int index, String name) async {
    await _writeAccount(
      index,
      (account) => account.copyWith(name: name.trim()),
    );
  }

  /// Sets or clears an account's badge.
  Future<void> badgeAccount(int index, String? emoji) async {
    await _writeAccount(
      index,
      (account) => emoji == null || emoji.isEmpty
          ? account.copyWith(clearEmoji: true)
          : account.copyWith(emoji: emoji),
    );
  }

  Future<void> _writeAccount(
    int index,
    Account Function(Account) change,
  ) async {
    if (index < 0 || index >= Account.limit) {
      return;
    }

    _accounts = _accounts.update(index, change);

    notifyListeners();

    await _store.setString(LegacyStore.keyAccounts, _accounts.encode());
  }

  /// Builds a signer for the account in view.
  ///
  /// Returns null when locked rather than throwing, so a caller that races the lock button gets a
  /// refusal instead of an exception — and never a signer built from a stale vault.
  String? privateKeyForSigning() {
    final vault = _vault;

    if (vault == null) {
      return null;
    }

    return vault.kind == VaultKind.privateKey
        ? vault.secret
        : HdWallet.fromMnemonic(vault.secret, _account).privateKeyHex;
  }

  /// The stored list, or the one account every wallet starts with.
  ///
  /// A private-key wallet is pinned to a single account whatever the store says: it holds one key,
  /// no index yields another, and a list left over from a phrase wallet on the same device would
  /// offer rows whose addresses this vault cannot sign for.
  AccountList _readAccounts() {
    if (!derivable) {
      return AccountList(<Account>[
        Account(
          index: 0,
          name: _store.getString(LegacyStore.keyName)?.trim() ?? '',
        ),
      ]);
    }

    return AccountList.decode(
      _store.getString(LegacyStore.keyAccounts),
      legacyName: _store.getString(LegacyStore.keyName),
    );
  }

  /// The stored active index, clamped to an account that actually exists.
  ///
  /// A stored index the list does not mention would show a derived address with no row behind it in
  /// the switcher, and no way to get back.
  int _readAccount() {
    final stored = int.tryParse(_store.getString(LegacyStore.keyActive) ?? '');

    return stored != null && _accounts.has(stored) ? stored : 0;
  }

  static String _encodePayload(VaultPayload payload) =>
      const JsonCodec().encode(payload.toJson());
}
