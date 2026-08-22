import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../../domain/chain/network.dart';

/// One transfer in the account's history.
class HistoryEntry {
  const HistoryEntry({
    required this.hash,
    required this.from,
    required this.to,
    required this.value,
    required this.decimals,
    required this.symbol,
    required this.at,
  });

  final String hash;
  final String from;
  final String to;
  final BigInt value;
  final int decimals;
  final String symbol;
  final DateTime at;

  /// Whether this row moved value towards [address].
  ///
  /// Compared lowercased: explorers are inconsistent about checksum casing, and a case-sensitive
  /// match would label a user's own incoming transfers as outgoing.
  bool receivedBy(String address) => to.toLowerCase() == address.toLowerCase();

  /// The stored shape, for the cache that holds these between launches.
  ///
  /// The amount is written as a decimal string rather than a number: it is a 256-bit integer, and
  /// JSON numbers are doubles — a large token balance would come back rounded, which for a
  /// transaction record means showing an amount that was never transferred.
  Map<String, dynamic> toJson() => <String, dynamic>{
    'hash': hash,
    'from': from,
    'to': to,
    'value': value.toString(),
    'decimals': decimals,
    'symbol': symbol,
    'at': at.millisecondsSinceEpoch,
  };

  /// Reads a cached row, or null when it is not what was written.
  static HistoryEntry? fromJson(Map<String, dynamic> json) {
    final hash = json['hash'];
    final at = json['at'];

    if (hash is! String || at is! int) {
      return null;
    }

    final value = BigInt.tryParse('${json['value']}');

    if (value == null) {
      return null;
    }

    return HistoryEntry(
      hash: hash,
      from: json['from'] is String ? json['from'] as String : '',
      to: json['to'] is String ? json['to'] as String : '',
      value: value,
      decimals: json['decimals'] is int ? json['decimals'] as int : 18,
      symbol: json['symbol'] is String ? json['symbol'] as String : '',
      at: DateTime.fromMillisecondsSinceEpoch(at),
    );
  }
}

/// What an explorer said.
///
/// [notice] carries the reason when the list is empty for a reason other than "nothing happened".
/// The two are genuinely different — "no transactions yet" and "the explorer would not answer" call
/// for different words, and showing the first when the second is true tells a user their history is
/// gone.
class HistoryAnswer {
  const HistoryAnswer({
    required this.entries,
    this.notice = '',
    this.offline = false,
  });

  final List<HistoryEntry> entries;
  final String notice;

  /// Whether the read failed below HTTP — no route, no DNS, no socket.
  ///
  /// Derived from the failure itself rather than from a global connectivity flag. An explorer that
  /// answers at all, even to refuse, proves the link is up; nothing else does. A connectivity API
  /// reports the state of an interface, which is a different question from whether this host could
  /// be reached, and the two disagree exactly when it matters — on a captive portal, or a network
  /// that is up but has no route out.
  final bool offline;
}

/// Reads transfer history from an Etherscan-compatible explorer.
///
/// Native transfers and token transfers come from two different actions — `txlist` and `tokentx` —
/// and both are asked for, because a wallet showing only one of them is showing half the account's
/// history. They are merged newest-first.
class HistoryRepository {
  HistoryRepository(this._network, {http.Client? client})
    : _client = client ?? http.Client();

  final Network _network;
  final http.Client _client;

  static const int _pageSize = 50;

  /// The account's recent transfers.
  ///
  /// A failure of one action does not lose the other: a chain whose explorer supports `txlist` but
  /// not `tokentx` should still show native transfers rather than nothing.
  Future<HistoryAnswer> read(String address) async {
    final api = _network.explorerApiBase;

    if (api.isEmpty) {
      return const HistoryAnswer(
        entries: <HistoryEntry>[],
        notice: 'this network declares no explorer',
      );
    }

    final answers = await Future.wait(<Future<HistoryAnswer>>[
      _action('txlist', address, api),
      _action('tokentx', address, api),
    ]);

    final entries = <HistoryEntry>[
      for (final answer in answers) ...answer.entries,
    ]..sort((a, b) => b.at.compareTo(a.at));

    // Only report a problem when there is nothing to show. A notice above a populated list would
    // suggest the rows are suspect when they are simply incomplete.
    final notice = entries.isEmpty
        ? answers
              .map((a) => a.notice)
              .firstWhere((n) => n.isNotEmpty, orElse: () => '')
        : '';

    return HistoryAnswer(
      entries: entries,
      notice: notice,
      // Only when nothing was reached at all. One action failing to connect while the other
      // answered is a fault of that request, not of the link.
      offline: entries.isEmpty && answers.every((a) => a.offline),
    );
  }

  Future<HistoryAnswer> _action(
    String action,
    String address,
    String api,
  ) async {
    final query =
        'module=account&action=$action'
        '&address=${Uri.encodeComponent(address)}'
        '&page=1&offset=$_pageSize&sort=desc';

    final url = Uri.parse('$api${api.contains('?') ? '&' : '?'}$query');

    try {
      final response = await _client
          .get(url)
          .timeout(const Duration(seconds: 15));

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return HistoryAnswer(
          entries: const <HistoryEntry>[],
          notice: 'explorer answered HTTP ${response.statusCode}',
        );
      }

      final parsed = jsonDecode(response.body);

      if (parsed is! Map<String, dynamic>) {
        return const HistoryAnswer(
          entries: <HistoryEntry>[],
          notice: 'explorer returned an unexpected body',
        );
      }

      final result = parsed['result'];

      // Blockscout answers `status: '0'` with "no transactions found" for an account that has never
      // transacted. That is a normal empty result, and it still carries `result` as an array — which
      // is exactly how it is told apart from a refusal, where `result` is the explanation itself.
      if (result is! List) {
        return HistoryAnswer(
          entries: const <HistoryEntry>[],
          notice: result is String && result.isNotEmpty
              ? result
              : 'explorer returned no result',
        );
      }

      return HistoryAnswer(
        entries: result
            .whereType<Map<String, dynamic>>()
            .map((row) => _row(row, native: action == 'txlist'))
            .whereType<HistoryEntry>()
            .toList(),
      );
    } on Object catch (error) {
      return HistoryAnswer(
        entries: const <HistoryEntry>[],
        notice: error is http.ClientException ? error.message : '$error',
        // A socket that never opened, a name that did not resolve, or a request that ran out of
        // time before a byte came back. None of these is the explorer's answer.
        offline:
            error is SocketException ||
            error is http.ClientException ||
            error is TimeoutException,
      );
    }
  }

  /// Reads one row, or null when it is not a transfer this list can show.
  ///
  /// Every field arrives as a string, including the numeric ones, and the token fields are absent on
  /// native rows. A row that will not parse is dropped rather than shown as a zero-value transfer,
  /// which would be a transaction the user never made.
  HistoryEntry? _row(Map<String, dynamic> row, {required bool native}) {
    final hash = row['hash'];
    final value = row['value'];
    final stamp = row['timeStamp'];

    if (hash is! String || value is! String || stamp is! String) {
      return null;
    }

    final amount = BigInt.tryParse(value);
    final seconds = int.tryParse(stamp);

    if (amount == null || seconds == null) {
      return null;
    }

    // A native row on `txlist` with no value is a contract call, not a transfer. Showing it as a
    // zero-coin transfer would fill the list with rows that mean nothing to the user.
    if (native && amount == BigInt.zero) {
      return null;
    }

    final decimals = native
        ? _network.decimals
        : int.tryParse('${row['tokenDecimal']}') ?? 18;

    return HistoryEntry(
      hash: hash,
      from: row['from'] is String ? row['from'] as String : '',
      to: row['to'] is String ? row['to'] as String : '',
      value: amount,
      decimals: decimals,
      symbol: native
          ? _network.symbol
          : (row['tokenSymbol'] is String ? row['tokenSymbol'] as String : ''),
      at: DateTime.fromMillisecondsSinceEpoch(seconds * 1000),
    );
  }

  void close() => _client.close();
}
