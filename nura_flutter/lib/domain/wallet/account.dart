import 'dart:convert';

/// One derivable account.
///
/// [index] is the BIP-44 address index — `m/44'/60'/0'/0/{index}` — so the whole list is
/// reproducible from the one recovery phrase. Nothing is stored beyond the label and the badge,
/// because nothing else about an account is a secret worth keeping or a fact worth caching: the
/// address itself is derived on demand.
class Account {
  const Account({required this.index, this.name = '', this.emoji});

  final int index;

  /// The label the user gave this account, or empty when they have not given one.
  ///
  /// Empty rather than a filled-in default, deliberately. The Tauri build wrote "Account 3" into the
  /// store at creation, which freezes the label into whatever language was active that day — a user
  /// who switches to Persian keeps a list of English defaults. Storing nothing and localising at
  /// display time relabels them all. It reads identically to the old build, whose own loader already
  /// falls back to its localised default for an empty name.
  final String name;

  /// The badge, absent until the user picks one.
  ///
  /// Never an empty string: clearing a badge drops the field rather than storing a blank, so "no
  /// badge" has one representation instead of two.
  final String? emoji;

  /// Longest badge accepted from storage.
  ///
  /// An emoji is rarely one code unit — a flag is two, and anything with a skin tone or a variation
  /// selector is more — so the cap is generous, but it still stops a hand-edited store from putting
  /// a paragraph on an account disc.
  static const int emojiLimit = 16;

  /// Highest derivation index the wallet accepts, exclusive.
  ///
  /// Accounts are not slots to be filled: index 0 comes with the wallet and the user adds whichever
  /// further indexes they want. This is the bound that keeps a typed index sane and a corrupt stored
  /// entry from deriving something absurd. BIP-44 allows far more; the cap is about the label and
  /// the input staying comprehensible, not about the key space.
  static const int limit = 100;

  /// Lowest derivation index the add form offers.
  ///
  /// Index 0 comes with the wallet and is always present, so it is the one index that can never be
  /// added — offering it only ever produced the "already in your list" error. Reading still accepts
  /// 0, because that is the account every wallet starts with.
  static const int first = 1;

  bool get hasBadge => emoji != null && emoji!.isNotEmpty;

  Account copyWith({String? name, String? emoji, bool clearEmoji = false}) =>
      Account(
        index: index,
        name: name ?? this.name,
        emoji: clearEmoji ? null : (emoji ?? this.emoji),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'index': index,
    'name': name,
    if (emoji != null && emoji!.isNotEmpty) 'emoji': emoji,
  };

  /// Reads a stored account, or null when the entry is unusable.
  static Account? fromJson(Map<String, dynamic> json) {
    final index = json['index'];

    // `name` must be present even when empty: that is what the Tauri loader tests for, and an entry
    // without it is one it would drop. Reading the same way keeps the two builds agreeing on which
    // rows exist.
    if (index is! int ||
        index < 0 ||
        index >= limit ||
        !json.containsKey('name')) {
      return null;
    }

    final emoji = json['emoji'];

    return Account(
      index: index,
      name: json['name'] is String ? (json['name'] as String).trim() : '',
      emoji: emoji is String && emoji.isNotEmpty && emoji.length <= emojiLimit
          ? emoji
          : null,
    );
  }
}

/// The accounts of one wallet, ordered by index.
class AccountList {
  const AccountList(this.accounts);

  final List<Account> accounts;

  int get length => accounts.length;

  bool has(int index) => accounts.any((a) => a.index == index);

  Account? at(int index) {
    for (final account in accounts) {
      if (account.index == index) {
        return account;
      }
    }

    return null;
  }

  /// Adds an index, or returns the list unchanged when it is already there.
  AccountList add(int index) => has(index)
      ? this
      : AccountList(
          <Account>[...accounts, Account(index: index)]
            ..sort((a, b) => a.index.compareTo(b.index)),
        );

  /// Replaces one account, adding it when the index is not yet in the list.
  AccountList update(int index, Account Function(Account) change) {
    final existing = at(index) ?? Account(index: index);

    return AccountList(
      <Account>[...accounts.where((a) => a.index != index), change(existing)]
        ..sort((a, b) => a.index.compareTo(b.index)),
    );
  }

  String encode() =>
      jsonEncode(accounts.map((a) => a.toJson()).toList(growable: false));

  /// Reads the stored list, never returning an empty one.
  ///
  /// Anything malformed is dropped rather than thrown on: a corrupt entry costs that account, not
  /// access to the wallet. [legacyName] is the single `Wallet.Name` that wallets created before
  /// multi-account support stored, and it is carried onto index 0 so an upgrade keeps the name the
  /// user chose.
  static AccountList decode(String? raw, {String? legacyName}) {
    final accounts = <Account>[];

    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);

        if (decoded is List) {
          for (final entry in decoded.whereType<Map<String, dynamic>>()) {
            final account = Account.fromJson(entry);

            // A duplicate index would give the switcher two rows that derive one address, and the
            // second would be unreachable. The first wins, as the Tauri loader has it.
            if (account != null &&
                !accounts.any((a) => a.index == account.index)) {
              accounts.add(account);
            }
          }
        }
      } on FormatException {
        accounts.clear();
      }
    }

    if (accounts.isEmpty) {
      return AccountList(<Account>[
        Account(index: 0, name: legacyName?.trim() ?? ''),
      ]);
    }

    return AccountList(accounts..sort((a, b) => a.index.compareTo(b.index)));
  }
}
