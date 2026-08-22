import 'dart:convert';

/// A tracked ERC-20 token, as the wallet stores it.
///
/// Metadata is captured once when the token is added — read off the contract, never taken from
/// whoever asked for it to be tracked — and stored so the list can be drawn before any balance
/// arrives. The balance itself is always live.
class Token {
  const Token({
    required this.address,
    required this.symbol,
    required this.name,
    required this.decimals,
  });

  final String address;
  final String symbol;
  final String name;
  final int decimals;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'address': address,
    'symbol': symbol,
    'name': name,
    'decimals': decimals,
  };

  /// Reads a stored token, or null when the row is unusable.
  static Token? fromJson(Map<String, dynamic> json) {
    final address = json['address'];
    final decimals = json['decimals'];

    if (address is! String || address.isEmpty || decimals is! int) {
      return null;
    }

    return Token(
      address: address,
      symbol: json['symbol'] is String ? json['symbol'] as String : '',
      name: json['name'] is String ? json['name'] as String : '',
      decimals: decimals,
    );
  }

  /// Case-insensitive identity. Addresses are compared lowercased throughout because EIP-55
  /// checksumming is presentation — the same contract written two ways is one token, and treating
  /// them as two is how a list ends up with duplicates the user cannot remove.
  bool sameAs(String other) => address.toLowerCase() == other.toLowerCase();
}

/// The tracked tokens of every chain, keyed by chain id.
///
/// Per chain because the same symbol is a different contract elsewhere: USDT on Ethereum and USDT
/// on BNB Smart Chain are unrelated addresses, and one list would show a balance from the wrong one.
class TokenMap {
  const TokenMap(this._byChain);

  const TokenMap.empty() : _byChain = const <int, List<Token>>{};

  final Map<int, List<Token>> _byChain;

  List<Token> forChain(int chainId) => _byChain[chainId] ?? const <Token>[];

  /// Adds a token to one chain, replacing any entry for the same contract.
  TokenMap add(int chainId, Token token) {
    final existing = forChain(chainId).where((t) => !t.sameAs(token.address));

    return TokenMap(<int, List<Token>>{
      ..._byChain,
      chainId: <Token>[...existing, token],
    });
  }

  TokenMap remove(int chainId, String address) {
    return TokenMap(<int, List<Token>>{
      ..._byChain,
      chainId: forChain(chainId).where((t) => !t.sameAs(address)).toList(),
    });
  }

  bool has(int chainId, String address) =>
      forChain(chainId).any((t) => t.sameAs(address));

  /// Serialises in the shape the Tauri build wrote: an object of chain id to token array.
  ///
  /// The keys are strings because JSON has no integer keys — which is also why reading them back
  /// parses rather than casts.
  String encode() => jsonEncode(<String, dynamic>{
    for (final entry in _byChain.entries)
      '${entry.key}': entry.value.map((t) => t.toJson()).toList(),
  });

  /// Reads the stored map, dropping anything unusable rather than throwing.
  ///
  /// A corrupt row costs that token, not the list, and not the wallet. The user can add it again;
  /// they cannot recover from a dashboard that will not open.
  static TokenMap decode(String? raw) {
    if (raw == null || raw.isEmpty) {
      return const TokenMap.empty();
    }

    try {
      final decoded = jsonDecode(raw);

      if (decoded is! Map<String, dynamic>) {
        return const TokenMap.empty();
      }

      final out = <int, List<Token>>{};

      for (final entry in decoded.entries) {
        final chainId = int.tryParse(entry.key);
        final value = entry.value;

        if (chainId == null || value is! List) {
          continue;
        }

        out[chainId] = value
            .whereType<Map<String, dynamic>>()
            .map(Token.fromJson)
            .whereType<Token>()
            .toList();
      }

      return TokenMap(out);
    } on FormatException {
      return const TokenMap.empty();
    }
  }
}
