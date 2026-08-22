import 'dart:typed_data';

import 'package:bip32/bip32.dart' as bip32;
import 'package:bip39/bip39.dart' as bip39;
import 'package:web3dart/credentials.dart';

/// What kind of key material a wallet was opened with.
///
/// The distinction only matters upstream of the signer: a phrase can derive an unlimited number of
/// accounts, a raw key is exactly one and no index will ever produce a second.
enum VaultKind { mnemonic, privateKey }

/// A raw secp256k1 private key as it is written: 64 hex characters, with or without `0x`.
///
/// Shape only. Whether those 32 bytes are actually in range is decided by trying to build a signer
/// from them; this is just what tells a key apart from a phrase.
final RegExp _privateKeyShape = RegExp(r'^(?:0x)?[0-9a-fA-F]{64}$');

/// The unlocked key material, and what it turned out to be.
///
/// The kind is derived from the secret rather than stored beside it, matching `vault.ts`. A stored
/// marker would be a second source of truth able to disagree with the payload it describes, and a
/// wallet whose marker says "mnemonic" over a private key cannot be opened at all.
class Vault {
  const Vault({required this.kind, required this.secret});

  final VaultKind kind;
  final String secret;

  factory Vault.read(String secret) {
    final trimmed = secret.trim();

    return Vault(
      kind: _privateKeyShape.hasMatch(trimmed)
          ? VaultKind.privateKey
          : VaultKind.mnemonic,
      secret: trimmed,
    );
  }

  /// Whether this wallet can produce accounts beyond the one it opened with.
  bool get derivable => kind == VaultKind.mnemonic;
}

/// Derives accounts the way the Tauri build does, and it must stay bit-identical.
///
/// The TypeScript spells the path in two steps — `fromPhrase(phrase, '', "m/44'/60'/0'")` and then
/// `derivePath("0/{index}")` — which resolves to `m/44'/60'/0'/0/{index}`. That is standard BIP-44
/// for Ethereum, so the split is presentation rather than substance, but it is written out here to
/// make the equivalence explicit: an off-by-one in the path yields perfectly valid addresses that
/// simply are not the user's, and the money is not there.
///
/// The phrase is NFKD-normalised before use. BIP-39 requires it, and it is the difference between a
/// phrase typed with composed accents opening a wallet and silently deriving a different one.
class HdWallet {
  const HdWallet._(this._node);

  final bip32.BIP32 _node;

  static const String basePath = "m/44'/60'/0'";

  /// Opens the account at [index] of a mnemonic wallet.
  factory HdWallet.fromMnemonic(String mnemonic, int index) {
    final normalised = _nfkd(mnemonic.trim());

    if (!bip39.validateMnemonic(normalised)) {
      throw ArgumentError('the recovery phrase is not valid BIP-39');
    }

    final seed = bip39.mnemonicToSeed(normalised);

    return HdWallet._(
      bip32.BIP32.fromSeed(seed).derivePath("$basePath/0/$index"),
    );
  }

  /// The private key of this account, `0x`-prefixed.
  String get privateKeyHex {
    final key = _node.privateKey;

    if (key == null) {
      throw StateError('this node holds no private key');
    }

    return '0x${_hex(key)}';
  }

  /// The EIP-55 checksummed address of this account.
  String get address => EthPrivateKey.fromHex(privateKeyHex).address.hexEip55;

  /// The address of a wallet imported as a raw private key.
  ///
  /// A private-key wallet ignores the derivation index entirely — it is one key and one account.
  static String addressOfPrivateKey(String privateKey) {
    if (!_privateKeyShape.hasMatch(privateKey.trim())) {
      throw ArgumentError('not a 32-byte hex private key');
    }

    return EthPrivateKey.fromHex(privateKey.trim()).address.hexEip55;
  }

  /// The address for one account of an unlocked vault, whichever kind it is.
  static String addressOf(Vault vault, int index) {
    return vault.kind == VaultKind.privateKey
        ? addressOfPrivateKey(vault.secret)
        : HdWallet.fromMnemonic(vault.secret, index).address;
  }

  static String _hex(Uint8List bytes) =>
      bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

  /// Dart's core library has no Unicode normaliser, and BIP-39 phrases are drawn from a wordlist of
  /// plain ASCII words separated by single spaces. Collapsing whitespace is therefore the whole of
  /// what NFKD can change for a *valid* phrase — and an invalid one is rejected above regardless.
  static String _nfkd(String value) => value.split(RegExp(r'\s+')).join(' ');
}
