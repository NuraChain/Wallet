import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../../domain/chain/network.dart';
import '../../domain/chain/token.dart';
import 'history_repository.dart';

/// Reads the chains an Etherscan-family explorer will not.
///
/// BNB Smart Chain is the reason this exists. Its data is only sold through a paid Etherscan plan,
/// no Blockscout instance covers it, and the free RPCs cap `eth_getLogs` at a few thousand blocks —
/// minutes of history, and native transfers cannot be read from logs at all. GoldRush answers chain
/// 56 on a free key, so it is asked whenever the explorer comes back with nothing.
///
/// A fallback and not the first choice: Blockscout serves Nura and Ethereum without a key or a
/// credit, and spending either where the explorer already works would be waste.
class GoldRushRepository {
  GoldRushRepository({http.Client? client, String? key})
    : _client = client ?? http.Client(),
      _key = key ?? apiKey;

  final http.Client _client;
  final String _key;

  /// The key, supplied at build time as `--dart-define=COVALENT_KEY=...`.
  ///
  /// Never checked in. The Tauri build read the same value from its build environment, and the value
  /// it once carried was committed to git and has to be treated as public — which is exactly why
  /// this reads from the environment and not from a constant. Unset, it is empty, and every request
  /// below degrades to an empty list rather than sending an unauthenticated one.
  static const String apiKey = String.fromEnvironment('COVALENT_KEY');

  static const String _base = 'https://api.covalenthq.com/v1';

  /// How many tracked tokens are asked about.
  ///
  /// Token movements come one contract per request, at about a second each, so an account tracking a
  /// long list would otherwise spend a slow minute assembling one screen.
  static const int _tokenLimit = 4;

  /// What GoldRush answers for a chain it does not index.
  static const int _notImplemented = 501;

  /// The chains that have answered "not indexed", for this run.
  ///
  /// Learned rather than listed. The obvious shape here is a constant naming the covered chains, and
  /// it is the wrong one: GoldRush indexes most of the EVM space and adds to it continuously, so a
  /// list written today switches the fallback off for chains it covers tomorrow — and it would take
  /// every network the user adds by hand with it, which is the whole population this exists to
  /// serve. Asking once and believing the answer is never out of date.
  ///
  /// Held for the session rather than on disk. The cost of forgetting is one request per launch, on
  /// a path only reached when the explorer already returned nothing; the cost of remembering it on
  /// disk is a chain that gets indexed later staying switched off until someone clears a file.
  static final Set<int> _unindexed = <int>{};

  /// Whether this chain is worth asking about.
  ///
  /// Optimistic until proven otherwise, which is what keeps hand-added networks working without
  /// anyone maintaining a list.
  bool covers(int chainId) => _key.isNotEmpty && !_unindexed.contains(chainId);

  /// Coin and token movements together.
  ///
  /// Every path resolves rather than throws: this is a fallback, and a fallback that fails loudly
  /// would replace the explorer's own explanation with its own.
  Future<HistoryAnswer> read(
    String address,
    Network network,
    List<Token> tokens,
  ) async {
    if (!covers(network.chainId)) {
      return const HistoryAnswer(entries: <HistoryEntry>[]);
    }

    final reads = <Future<List<HistoryEntry>>>[
      _native(address, network),
      for (final token in tokens.take(_tokenLimit))
        _token(address, network, token),
    ];

    final results = await Future.wait(reads);

    return HistoryAnswer(
      entries: <HistoryEntry>[for (final list in results) ...list]
        ..sort((a, b) => b.at.compareTo(a.at)),
    );
  }

  /// The account's own coin transfers.
  ///
  /// `no-logs=true` matters more than it looks. With the logs left in, one page of this came back at
  /// fourteen megabytes: GoldRush lists every transaction the address appears anywhere inside — spam
  /// airdrops included — and attaches every decoded event to each one. Without them the same page is
  /// sixty kilobytes.
  Future<List<HistoryEntry>> _native(String address, Network network) async {
    final rows = await _get(
      network.chainId,
      '/address/${Uri.encodeComponent(address)}/transactions_v3/?no-logs=true',
    );

    final owner = address.toLowerCase();

    return rows
        .map((row) {
          final hash = row['tx_hash'];
          final from = row['from_address'];
          final value = row['value'];

          if (hash is! String || from is! String || value is! String) {
            return null;
          }

          final to = row['to_address'] is String
              ? row['to_address'] as String
              : '';
          final amount = BigInt.tryParse(value);

          // A row worth nothing moved no coin, and a row this account is neither side of is one it only
          // appears in through a log — the token pass reads those.
          if (amount == null ||
              amount == BigInt.zero ||
              (from.toLowerCase() != owner && to.toLowerCase() != owner)) {
            return null;
          }

          return HistoryEntry(
            hash: hash,
            from: from,
            to: to,
            value: amount,
            decimals: network.decimals,
            symbol: network.symbol,
            at: _stamp(row['block_signed_at']),
          );
        })
        .whereType<HistoryEntry>()
        .toList();
  }

  /// One tracked contract's movements in and out of the account.
  Future<List<HistoryEntry>> _token(
    String address,
    Network network,
    Token token,
  ) async {
    final rows = await _get(
      network.chainId,
      '/address/${Uri.encodeComponent(address)}/transfers_v2/'
      '?contract-address=${Uri.encodeComponent(token.address)}',
    );

    final out = <HistoryEntry>[];

    for (final row in rows) {
      final transfers = row['transfers'];

      if (transfers is! List) {
        continue;
      }

      for (final raw in transfers.whereType<Map<String, dynamic>>()) {
        final hash = raw['tx_hash'] is String
            ? raw['tx_hash'] as String
            : (row['tx_hash'] is String ? row['tx_hash'] as String : '');

        final delta = raw['delta'];

        if (hash.isEmpty || delta is! String) {
          continue;
        }

        final amount = BigInt.tryParse(delta);

        if (amount == null) {
          continue;
        }

        final symbol = raw['contract_ticker_symbol'];

        out.add(
          HistoryEntry(
            hash: hash,
            from: raw['from_address'] is String
                ? raw['from_address'] as String
                : '',
            to: raw['to_address'] is String ? raw['to_address'] as String : '',
            value: amount,
            decimals: raw['contract_decimals'] is int
                ? raw['contract_decimals'] as int
                : token.decimals,
            symbol: symbol is String && symbol.isNotEmpty
                ? symbol
                : token.symbol,
            at: _stamp(raw['block_signed_at'] ?? row['block_signed_at']),
          ),
        );
      }
    }

    return out;
  }

  /// Asks for one list, and treats every failure as an empty one.
  ///
  /// The chain is a parameter rather than part of [path] so that a `501` can be attributed to it.
  /// That is the one status worth remembering, and it is remembered here because this is the only
  /// place it is visible — every caller above sees an empty list and cannot tell "no rows" from
  /// "not this chain".
  Future<List<Map<String, dynamic>>> _get(int chainId, String path) async {
    try {
      final response = await _client
          .get(
            Uri.parse('$_base/$chainId$path'),
            headers: <String, String>{'Authorization': 'Bearer $_key'},
          )
          .timeout(const Duration(seconds: 20));

      if (response.statusCode < 200 || response.statusCode >= 300) {
        if (response.statusCode == _notImplemented) {
          _unindexed.add(chainId);
        }

        return const <Map<String, dynamic>>[];
      }

      final parsed = jsonDecode(response.body);

      if (parsed is! Map<String, dynamic>) {
        return const <Map<String, dynamic>>[];
      }

      final data = parsed['data'];
      final items = data is Map<String, dynamic> ? data['items'] : null;

      return items is List
          ? items.whereType<Map<String, dynamic>>().toList()
          : const <Map<String, dynamic>>[];
    } on FormatException {
      return const <Map<String, dynamic>>[];
    } on http.ClientException {
      return const <Map<String, dynamic>>[];
    } on SocketException {
      return const <Map<String, dynamic>>[];
    } on TimeoutException {
      return const <Map<String, dynamic>>[];
    }
  }

  /// GoldRush stamps rows with an ISO string; everything else here counts milliseconds.
  static DateTime _stamp(Object? value) {
    final parsed = value is String ? DateTime.tryParse(value) : null;

    return parsed ?? DateTime.fromMillisecondsSinceEpoch(0);
  }

  void close() => _client.close();
}
