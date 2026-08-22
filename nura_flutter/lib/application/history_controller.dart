import 'package:flutter/foundation.dart';

import '../data/cache/history_cache.dart';
import '../data/repositories/goldrush_repository.dart';
import '../data/repositories/history_repository.dart';
import '../domain/chain/network.dart';
import '../domain/chain/token.dart';

/// The account's transaction history, held for the screens that show it.
///
/// Stale-while-revalidate: a held list renders on the spot and the network runs behind it, so
/// switching back to an account visited earlier shows its rows immediately instead of blanking to a
/// loading line and back. [isLoading] is only raised when there is nothing to show — raising it over
/// a list already on screen is the flicker this arrangement exists to avoid.
class HistoryController extends ChangeNotifier {
  HistoryController(
    this._cache, {
    HistoryRepository Function(Network)? explorer,
    GoldRushRepository? fallback,
  }) : _explorer = explorer ?? HistoryRepository.new,
       _fallback = fallback ?? GoldRushRepository();

  final HistoryCache _cache;
  final HistoryRepository Function(Network) _explorer;
  final GoldRushRepository _fallback;

  List<HistoryEntry> _entries = const <HistoryEntry>[];

  String _notice = '';
  bool _offline = false;
  bool _loading = false;

  /// The key the rows on screen belong to, so a late answer for a different account is dropped.
  String _key = '';

  /// One read per key, however many callers ask for it while it is running.
  ///
  /// Switching away from an account and straight back while its read is running joins the request
  /// already in flight rather than starting a second one against a rate-limited explorer. A manual
  /// refresh arriving mid-read joins it too, which is the right answer — the fetch it would have
  /// started is the fetch already happening.
  final Map<String, Future<HistoryAnswer>> _inflight =
      <String, Future<HistoryAnswer>>{};

  List<HistoryEntry> get entries => _entries;

  /// Why the list is empty, when the explorer said so itself.
  String get notice => _notice;

  /// Whether the last read never reached anything.
  bool get isOffline => _offline;

  bool get isLoading => _loading;

  /// Reads one account's history on one chain.
  ///
  /// [force] skips a fresh cache entry, because the point of a pull-to-refresh is to distrust what
  /// is held.
  Future<void> load(
    String address,
    Network network,
    List<Token> tokens, {
    bool force = false,
  }) async {
    if (address.isEmpty) {
      return;
    }

    final now = DateTime.now();
    final key = HistoryCache.keyFor(
      address,
      network.chainId,
      network.explorerApiBase,
    );

    final held = _cache.read(key, now: now);

    // A different account or chain: whatever is on screen belongs to the previous one and is not an
    // answer about this one. Cleared rather than left in place, because a list that stays put while
    // the header changes reads as this account's history.
    if (key != _key) {
      _key = key;
      _entries = held?.entries ?? const <HistoryEntry>[];
      _notice = held?.notice ?? '';
      _offline = false;
    } else if (held != null) {
      _entries = held.entries;
      _notice = held.notice;
    }

    if (held != null && held.fresh && !force) {
      _loading = false;

      notifyListeners();

      return;
    }

    _loading = _entries.isEmpty;

    notifyListeners();

    final answer = await _read(key, address, network, tokens);

    // A read that finished after the user moved on is not about what is on screen now.
    if (key != _key) {
      return;
    }

    _loading = false;
    _offline = answer.offline;

    // Nothing back *and* a reason is the explorer refusing or the link being away — not the account
    // being empty. Rows already held are kept rather than cleared, which is what stops a dropped
    // connection turning a populated list into an empty one. Nothing is written either: a failure is
    // not an answer, and storing it would age out the good rows behind it.
    if (answer.entries.isEmpty &&
        answer.notice.isNotEmpty &&
        _entries.isNotEmpty) {
      notifyListeners();

      return;
    }

    _notice = answer.notice;
    _entries = await _cache.write(
      key,
      answer.entries,
      answer.notice,
      now: DateTime.now(),
    );

    notifyListeners();
  }

  /// Forgets every account's history.
  ///
  /// Called when the wallet is locked away for good — at that point none of it belongs to the wallet
  /// that is open. Switching account or chain does *not* call this: the other account's history is
  /// still true, and dropping it would cost a re-download for a change that did not touch it.
  Future<void> forget() async {
    _entries = const <HistoryEntry>[];
    _notice = '';
    _offline = false;
    _key = '';

    await _cache.clear();

    notifyListeners();
  }

  /// The network read, coalesced on the key, with the fallback behind it.
  Future<HistoryAnswer> _read(
    String key,
    String address,
    Network network,
    List<Token> tokens,
  ) {
    final running = _inflight[key];

    if (running != null) {
      return running;
    }

    final request = _fetch(address, network, tokens);

    _inflight[key] = request;

    return request.whenComplete(() => _inflight.remove(key));
  }

  Future<HistoryAnswer> _fetch(
    String address,
    Network network,
    List<Token> tokens,
  ) async {
    final answer = await _explorer(network).read(address);

    // Asked only where the explorer came up empty, so the chains it already serves cost no credits.
    // An account that genuinely has no transactions pays one wasted request for that.
    if (answer.entries.isNotEmpty || !_fallback.covers(network.chainId)) {
      return answer;
    }

    final second = await _fallback.read(address, network, tokens);

    return second.entries.isEmpty ? answer : second;
  }
}
