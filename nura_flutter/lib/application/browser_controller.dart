import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../data/storage/app_store.dart';
import '../data/storage/legacy_store.dart';
import '../domain/browser/browser_tab.dart';
import '../domain/browser/site.dart';

/// The browser's state: which tabs are open, where each has been, and the two lists kept on disk.
///
/// Tabs are held in memory only, which is the Tauri build's behaviour and not an omission. A tab is
/// a live view onto a page; restoring one across a launch would restore the address without the page
/// — and this browser is reached from a wallet, where the session it belonged to has been locked in
/// the meantime anyway.
///
/// The view preference, the visit list and the favourites do persist, under the same keys and in the
/// same JSON shape the Tauri build wrote, so a wallet carrying either still reads here.
class BrowserController extends ChangeNotifier {
  BrowserController(this._store)
    : _view = BrowserView.resolve(
        _store.getString(LegacyStore.keyBrowserView),
      ) {
    _history = _readList(LegacyStore.keyBrowserHistory, BrowserVisit.read);

    _favorites = _readFavorites();
  }

  final AppStore _store;

  BrowserView _view;
  List<BrowserVisit> _history = const <BrowserVisit>[];
  List<BrowserFavorite> _favorites = defaultFavorites;

  /// The open tabs, in strip order. A browser always has at least one.
  List<BrowserTab> _tabs = const <BrowserTab>[BrowserTab(id: 1)];

  int _activeId = 1;

  /// The next id to hand out. Never reused, so a closed tab's id cannot name a living view.
  int _nextId = 2;

  List<BrowserTab> get tabs => List<BrowserTab>.unmodifiable(_tabs);

  int get activeId => _activeId;

  /// The tab in front.
  ///
  /// Falls back to the first rather than returning null: every path that reads this is drawing the
  /// toolbar or the view, and there is no arrangement of those for "no tab".
  BrowserTab get tab =>
      _tabs.firstWhere((t) => t.id == _activeId, orElse: () => _tabs.first);

  BrowserView get view => _view;

  List<BrowserVisit> get history => List<BrowserVisit>.unmodifiable(_history);

  List<BrowserFavorite> get favorites =>
      List<BrowserFavorite>.unmodifiable(_favorites);

  /// Brings a tab to the front.
  void select(int id) {
    if (_activeId == id || !_tabs.any((t) => t.id == id)) {
      return;
    }

    _activeId = id;

    notifyListeners();
  }

  /// Opens a tab, at [url] or at the start screen, and brings it to the front.
  ///
  /// Returns the new id so a caller that needs to address the view behind it does not have to go
  /// looking for which tab it just made.
  int open({String? url}) {
    final id = _nextId++;

    _tabs = <BrowserTab>[
      ..._tabs,
      url == null || url.isEmpty ? BrowserTab(id: id) : BrowserTab.at(id, url),
    ];

    _activeId = id;

    notifyListeners();

    return id;
  }

  /// Closes a tab.
  ///
  /// Closing the last one leaves a fresh empty tab rather than no tabs. A browser with nothing open
  /// has no state a screen can draw, and the alternative — closing the tab strip's last row and
  /// landing on a blank surface with no way to open anything — is a dead end.
  ///
  /// The tab in front, when it is the one closing, hands over to its neighbour on the left, or to
  /// the first if it was leftmost. That is where the eye already is.
  void close(int id) {
    final at = _tabs.indexWhere((t) => t.id == id);

    if (at < 0) {
      return;
    }

    final remaining = <BrowserTab>[..._tabs]..removeAt(at);

    if (remaining.isEmpty) {
      final fresh = _nextId++;

      _tabs = <BrowserTab>[BrowserTab(id: fresh)];
      _activeId = fresh;

      notifyListeners();

      return;
    }

    _tabs = remaining;

    if (_activeId == id) {
      _activeId = remaining[at > 0 ? at - 1 : 0].id;
    }

    notifyListeners();
  }

  /// Navigates the tab in front, and records the visit.
  ///
  /// The record is written after the navigation is applied, so the list on the start screen is never
  /// ahead of the tab it describes.
  Future<void> visit(String url) async {
    if (url.isEmpty) {
      return;
    }

    _patch((t) => t.visit(url));

    await record(url);
  }

  /// Moves the tab in front through its stack. Negative goes back.
  void step(int delta) => _patch((t) => t.step(delta));

  void goHome() => _patch((t) => t.goHome());

  void reload() => _patch((t) => t.reloaded());

  /// Sets what the address bar holds without navigating anywhere.
  void draft(String text) => _patch((t) => t.withDraft(text));

  void _patch(BrowserTab Function(BrowserTab) change) {
    final at = _tabs.indexWhere((t) => t.id == _activeId);

    if (at < 0) {
      return;
    }

    final next = change(_tabs[at]);

    if (identical(next, _tabs[at])) {
      return;
    }

    _tabs = <BrowserTab>[..._tabs]..[at] = next;

    notifyListeners();
  }

  /// Remembers the layout sites should be asked for.
  Future<void> setView(BrowserView view) async {
    if (_view == view) {
      return;
    }

    _view = view;

    notifyListeners();

    await _store.setString(LegacyStore.keyBrowserView, view.stored);
  }

  /// Records a page as the newest visit.
  ///
  /// A site opened again moves to the front rather than appearing twice, so the list stays a set of
  /// places rather than a log of trips.
  ///
  /// Written in plaintext, like the theme and the language. It is not key material, but it *is* a
  /// record of browsing, which is the whole reason [clearHistory] exists.
  Future<void> record(String url, {DateTime? at}) async {
    if (url.isEmpty) {
      return;
    }

    _history = <BrowserVisit>[
      BrowserVisit(url: url, time: at ?? DateTime.now()),
      ..._history.where((v) => v.url != url),
    ].take(historyLimit).toList(growable: false);

    notifyListeners();

    await _store.setString(
      LegacyStore.keyBrowserHistory,
      jsonEncode(_history.map((v) => v.toJson()).toList(growable: false)),
    );
  }

  /// Forgets every visit.
  ///
  /// The key is removed rather than set to an empty list, so nothing is left behind to read.
  ///
  /// The Tauri build had a second thing to clear here: it cached site icons to disk, and every one
  /// carried the address it came from, so clearing only the visit list left the same record written
  /// twice. Nothing here persists an icon — they are fetched per session and held in Flutter's own
  /// in-memory image cache — so there is no second copy to chase. If one is ever added, it has to be
  /// cleared from this method.
  Future<void> clearHistory() async {
    _history = const <BrowserVisit>[];

    notifyListeners();

    await _store.remove(LegacyStore.keyBrowserHistory);
  }

  /// Replaces the shortcut list, in display order.
  Future<void> setFavorites(List<BrowserFavorite> list) async {
    _favorites = List<BrowserFavorite>.unmodifiable(list);

    notifyListeners();

    await _store.setString(
      LegacyStore.keyBrowserFavorites,
      jsonEncode(_favorites.map((f) => f.toJson()).toList(growable: false)),
    );
  }

  Future<void> addFavorite(BrowserFavorite favorite) =>
      setFavorites(<BrowserFavorite>[..._favorites, favorite]);

  Future<void> removeFavorite(String id) =>
      setFavorites(_favorites.where((f) => f.id != id).toList(growable: false));

  Future<void> updateFavorite(String id, {String? name, String? url}) =>
      setFavorites(
        _favorites
            .map((f) => f.id == id ? f.copyWith(name: name, url: url) : f)
            .toList(growable: false),
      );

  /// The stored shortcuts, or the seed.
  ///
  /// A missing key means the wallet has never touched this list, so it gets the seed. A stored empty
  /// list is a different thing and is honoured: someone who removed every favourite is not asking
  /// for them back on the next launch.
  List<BrowserFavorite> _readFavorites() {
    if (_store.getString(LegacyStore.keyBrowserFavorites) == null) {
      return defaultFavorites;
    }

    return _readList(LegacyStore.keyBrowserFavorites, BrowserFavorite.read);
  }

  /// Reads one of the stored lists, treating anything unreadable as empty.
  ///
  /// A shortcut grid is not worth failing the start screen over, and neither is a visit list. Rows
  /// that do not parse are dropped individually rather than taking the list with them.
  List<T> _readList<T>(String key, T? Function(Object?) read) {
    final stored = _store.getString(key);

    if (stored == null || stored.isEmpty) {
      return const <Never>[];
    }

    final Object? decoded;

    try {
      decoded = jsonDecode(stored);
    } on FormatException {
      return const <Never>[];
    }

    if (decoded is! List) {
      return const <Never>[];
    }

    return <T>[
      for (final row in decoded)
        if (read(row) case final T parsed) parsed,
    ];
  }
}
