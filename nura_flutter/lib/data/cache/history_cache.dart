import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../repositories/history_repository.dart';

/// What a cache read found, and whether the caller still needs the network.
typedef HistoryHit = ({List<HistoryEntry> entries, String notice, bool fresh});

/// The account histories held between launches.
///
/// On disk, deliberately, and in a file of its own rather than in the wallet store. A transaction
/// that happened stays happened, so a list restored on the next launch is as true as it was when it
/// was written — the opposite of a balance, which is why balances are never persisted at all. Its
/// own file because the wallet store holds an encrypted recovery phrase and is rewritten atomically
/// on every change; a cache has no business sharing that write path.
class HistoryCache {
  HistoryCache._(this._file, this._entries);

  final File _file;
  final Map<String, _Entry> _entries;

  /// How long a fetched list is served without going back to the network.
  static const Duration fresh = Duration(minutes: 2);

  /// How long a list keeps rendering while a refresh runs behind it.
  ///
  /// Past this it is still rendered rather than blanked — a stale list beats an empty screen, and
  /// the network result replaces it when it lands.
  static const Duration stale = Duration(hours: 24);

  /// Accounts kept before the least recently used is dropped.
  static const int capacity = 24;

  static const String fileName = 'history.cache.json';

  /// Opens the cache, treating anything unreadable as empty.
  ///
  /// A cache is never worth failing a launch over: a corrupt file costs one re-download, while
  /// throwing here would cost the dashboard.
  static Future<HistoryCache> open({Directory? directory}) async {
    final base = directory ?? await getApplicationSupportDirectory();
    final file = File(p.join(base.path, fileName));

    try {
      if (await file.exists()) {
        return HistoryCache._(file, _decode(await file.readAsString()));
      }
    } on Object {
      // Falls through to an empty cache.
    }

    return HistoryCache._(file, <String, _Entry>{});
  }

  /// The name one account's history is filed under.
  ///
  /// Every input that changes the answer is in the key and nothing else is: the chain, because a
  /// list is only true of the chain it came from; the account; and the explorer actually being
  /// asked, because a custom network's API can be edited and the old answer is not the new
  /// endpoint's answer. The address is lowercased so one account is not filed twice under two
  /// spellings of itself.
  static String keyFor(String address, int chainId, String api) =>
      '$chainId|${address.toLowerCase()}|$api';

  /// What is held for a key, or null when nothing is.
  ///
  /// Reading is a use, so it moves the entry to the front of the eviction order. An entry that is
  /// only ever read would otherwise look like the coldest thing in the cache and be evicted first.
  HistoryHit? read(String key, {required DateTime now}) {
    final entry = _entries[key];

    if (entry == null) {
      return null;
    }

    _entries[key] = entry.usedAt(now);

    return (
      entries: entry.entries,
      notice: entry.notice,
      fresh: now.difference(entry.written) <= fresh,
    );
  }

  /// Stores an answer merged with whatever the key already held, and returns what is now held.
  ///
  /// Merged rather than replaced because the explorer answers a fixed window: a later read that
  /// comes back thinner than an earlier one would otherwise throw away rows the account still has.
  Future<List<HistoryEntry>> write(
    String key,
    List<HistoryEntry> entries,
    String notice, {
    required DateTime now,
  }) async {
    final held = _entries[key];

    final merged = held == null
        ? (List<HistoryEntry>.of(entries)..sort((a, b) => b.at.compareTo(a.at)))
        : _merge(held.entries, entries);

    _entries[key] = _Entry(
      entries: merged,
      notice: notice,
      written: now,
      used: now,
    );

    _evict();

    await _persist();

    return merged;
  }

  /// Drops the entries a change actually affects.
  ///
  /// Scoped rather than wholesale: switching account or chain does not make the other account's
  /// history wrong, and clearing it would cost a re-download for a change that did not touch it.
  /// Called with no argument — which only logging out does — it drops everything, because at that
  /// point none of it belongs to the wallet that is open.
  Future<void> clear([bool Function(String key)? match]) async {
    _entries.removeWhere((key, _) => match == null || match(key));

    await _persist();
  }

  /// The stable identity of one row, for deduplication.
  ///
  /// A hash alone is not enough: one transaction produces a native row *and* a token row whenever a
  /// transfer was paid for in the chain's own coin, and keying on the hash would drop one of the
  /// two. Hash plus the parties, the symbol and the amount is what makes "the same movement".
  static String identity(HistoryEntry entry) =>
      '${entry.hash}|${entry.symbol}|${entry.from.toLowerCase()}'
      '|${entry.to.toLowerCase()}|${entry.value}';

  /// Folds a newer read into what was already held, newest first.
  ///
  /// The newer row wins on collision, so a row that changed between reads takes its new form.
  static List<HistoryEntry> _merge(
    List<HistoryEntry> held,
    List<HistoryEntry> found,
  ) {
    final byIdentity = <String, HistoryEntry>{
      for (final entry in held) identity(entry): entry,
      for (final entry in found) identity(entry): entry,
    };

    return byIdentity.values.toList()..sort((a, b) => b.at.compareTo(a.at));
  }

  /// Drops the least recently used entries once the cache is over capacity.
  void _evict() {
    if (_entries.length <= capacity) {
      return;
    }

    final ordered = _entries.entries.toList()
      ..sort((a, b) => a.value.used.compareTo(b.value.used));

    for (final entry in ordered.take(_entries.length - capacity)) {
      _entries.remove(entry.key);
    }
  }

  Future<void> _persist() async {
    final encoded = jsonEncode(<String, dynamic>{
      for (final entry in _entries.entries) entry.key: entry.value.toJson(),
    });

    try {
      await _file.parent.create(recursive: true);

      // Written to a temporary file and renamed, so a launch during the write finds either the old
      // cache or the new one and never half of either.
      final temporary = File('${_file.path}.tmp');

      await temporary.writeAsString(encoded, flush: true);
      await temporary.rename(_file.path);
    } on FileSystemException {
      // A cache that cannot be written still works for this session.
    }
  }

  static Map<String, _Entry> _decode(String raw) {
    final decoded = jsonDecode(raw);

    if (decoded is! Map<String, dynamic>) {
      return <String, _Entry>{};
    }

    final out = <String, _Entry>{};

    for (final entry in decoded.entries) {
      final value = entry.value;

      if (value is Map<String, dynamic>) {
        final parsed = _Entry.fromJson(value);

        if (parsed != null) {
          out[entry.key] = parsed;
        }
      }
    }

    return out;
  }
}

/// One account's held history.
///
/// [notice] is stored beside the rows because it is the other half of the same answer: an explorer
/// that refuses produces no rows *and* a reason, and restoring the rows without the reason would
/// turn "unreadable" back into "no transactions" on the next launch.
class _Entry {
  const _Entry({
    required this.entries,
    required this.notice,
    required this.written,
    required this.used,
  });

  final List<HistoryEntry> entries;
  final String notice;
  final DateTime written;
  final DateTime used;

  _Entry usedAt(DateTime now) =>
      _Entry(entries: entries, notice: notice, written: written, used: now);

  Map<String, dynamic> toJson() => <String, dynamic>{
    'entries': entries.map((e) => e.toJson()).toList(),
    'notice': notice,
    'written': written.millisecondsSinceEpoch,
    'used': used.millisecondsSinceEpoch,
  };

  static _Entry? fromJson(Map<String, dynamic> json) {
    final entries = json['entries'];
    final written = json['written'];

    if (entries is! List || written is! int) {
      return null;
    }

    return _Entry(
      entries: entries
          .whereType<Map<String, dynamic>>()
          .map(HistoryEntry.fromJson)
          .whereType<HistoryEntry>()
          .toList(),
      notice: json['notice'] is String ? json['notice'] as String : '',
      written: DateTime.fromMillisecondsSinceEpoch(written),
      used: DateTime.fromMillisecondsSinceEpoch(
        json['used'] is int ? json['used'] as int : written,
      ),
    );
  }
}
