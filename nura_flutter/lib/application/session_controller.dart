import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/security/key_derivation.dart';
import '../core/security/vault_cipher.dart';
import '../data/storage/app_store.dart';
import '../data/storage/legacy_store.dart';
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

  SessionStage get stage => _stage;
  int get account => _account;

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
    _account = 0;
    _stage = SessionStage.unlocked;

    notifyListeners();
  }

  /// Drops the decrypted secret. The stored wallet is untouched.
  void lock() {
    _vault = null;
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
    _stage = SessionStage.intro;

    notifyListeners();
  }

  /// Switches which derived account the dashboard shows.
  Future<void> selectAccount(int index) async {
    if (_account == index || !derivable) {
      return;
    }

    _account = index;

    notifyListeners();

    await _store.setString(LegacyStore.keyActive, '$index');
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

  int _readAccount() {
    final stored = int.tryParse(_store.getString(LegacyStore.keyActive) ?? '');

    return stored != null && stored >= 0 ? stored : 0;
  }

  static String _encodePayload(VaultPayload payload) =>
      const JsonCodec().encode(payload.toJson());
}
