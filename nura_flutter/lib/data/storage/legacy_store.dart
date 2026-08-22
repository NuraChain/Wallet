import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

/// Reads the store the Tauri build left behind.
///
/// The file is named `application.bin` and is not binary at all: `tauri-plugin-store` serialises with
/// `serde_json::to_vec_pretty`, so it is pretty-printed JSON — one flat object of string keys to
/// JSON values. That was confirmed by reading the plugin source rather than by opening a user's file.
///
/// This exists so an upgrade is an upgrade. On Android the Flutter build ships under the same
/// `applicationId` as the Tauri one, so it inherits the very same private data directory and this
/// file is simply there. On Windows it sits beside the old executable's data. Either way, the first
/// launch after the migration must find the existing wallet rather than offer to create a new one.
class LegacyStore {
  const LegacyStore(this.values);

  /// Every key the old app wrote, exactly as it wrote them.
  final Map<String, dynamic> values;

  static const String fileName = 'application.bin';

  /// The keys the Tauri build used. Listed so a rename is a compile error rather than a silent miss.
  static const String keyMnemonic = 'Wallet.Mnemonic';
  static const String keyPassword = 'Wallet.Password';
  static const String keyAccounts = 'Wallet.Accounts';
  static const String keyActive = 'Wallet.Active';
  static const String keyName = 'Wallet.Name';
  static const String keyTokens = 'Wallet.Tokens';
  static const String keyTokensHidden = 'Wallet.TokensHidden';
  static const String keyLanguage = 'App.Language';
  static const String keyTheme = 'App.Theme';
  static const String keyNetwork = 'App.Network';
  static const String keyNetworks = 'App.Networks';
  static const String keyBrowserView = 'Browser.View';
  static const String keyBrowserHistory = 'Browser.History';
  static const String keyBrowserFavorites = 'Browser.Favorites';
  static const String keyBrowserConnections = 'Browser.Connections';

  /// Parses the store from its raw bytes.
  ///
  /// A file that will not parse is reported rather than swallowed. Everywhere else in this app a
  /// corrupt read degrades to a default, but not here: "no wallet found" and "the wallet is there and
  /// unreadable" must never look the same, because the first one leads a user to create a new wallet
  /// over the top of the old one.
  factory LegacyStore.parse(String contents) {
    final decoded = jsonDecode(contents);

    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('store root is not a JSON object');
    }

    return LegacyStore(decoded);
  }

  /// Reads the store from disk, or returns `null` when there is genuinely no previous install.
  static Future<LegacyStore?> read(Directory dataDirectory) async {
    final file = File(p.join(dataDirectory.path, fileName));

    if (!await file.exists()) {
      return null;
    }

    return LegacyStore.parse(await file.readAsString());
  }

  /// A string value, or `null` when the key was never written.
  ///
  /// Every value the old app stored went through its `setValue`, which takes a `string` — so a
  /// non-string here means the file was edited by something else, and it is treated as absent.
  String? string(String key) {
    final value = values[key];

    return value is String ? value : null;
  }

  /// Whether this store actually holds a wallet.
  bool get hasWallet {
    final mnemonic = string(keyMnemonic);

    return mnemonic != null && mnemonic.isNotEmpty;
  }

  /// The encrypted vault blob, still encrypted, ready for [VaultPayload.fromJson].
  ///
  /// The passphrase is not here and never was: what is stored is salt, IV and ciphertext, and none of
  /// it is meaningful without something the user knows.
  Map<String, dynamic>? get encryptedVault {
    final raw = string(keyMnemonic);

    if (raw == null || raw.isEmpty) {
      return null;
    }

    final decoded = jsonDecode(raw);

    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('stored vault is not a JSON object');
    }

    return decoded;
  }

  /// The stored unlock hash, for the password screen to compare against.
  String? get unlockHash => string(keyPassword);
}
