import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/application/browser_controller.dart';
import 'package:nura_wallet/data/storage/app_store.dart';
import 'package:nura_wallet/data/storage/legacy_store.dart';
import 'package:nura_wallet/domain/browser/browser_tab.dart';
import 'package:nura_wallet/domain/browser/site.dart';

void main() {
  late Directory root;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('nura-browser');
  });

  tearDown(() async {
    await root.delete(recursive: true);
  });

  Future<AppStore> freshStore() =>
      AppStore.open(directory: root, legacyCandidates: const <File>[]);

  group('BrowserTab', () {
    test('a new tab is at the start screen with nowhere to go', () {
      const tab = BrowserTab(id: 1);

      expect(tab.atStart, isTrue);
      expect(tab.url, isNull);
      expect(tab.canBack, isFalse);
      expect(tab.canForward, isFalse);
    });

    test('visiting builds the stack and moves the address bar with it', () {
      final tab = const BrowserTab(id: 1)
          .visit('https://a.example')
          .visit('https://b.example');

      expect(tab.entries, <String>['https://a.example', 'https://b.example']);
      expect(tab.url, 'https://b.example');
      expect(tab.draft, 'https://b.example');
      expect(tab.atStart, isFalse);
      expect(tab.canBack, isTrue);
      expect(tab.canForward, isFalse);
    });

    test('going somewhere new from the middle drops what was ahead', () {
      final tab = const BrowserTab(id: 1)
          .visit('https://a.example')
          .visit('https://b.example')
          .step(-1)
          .visit('https://c.example');

      expect(tab.entries, <String>['https://a.example', 'https://c.example']);
      expect(tab.canForward, isFalse);
    });

    test('a step past either end is refused rather than clamped', () {
      final one = const BrowserTab(id: 1).visit('https://a.example');

      // Clamping would land on a page the user did not ask for; refusing leaves them where they are.
      expect(identical(one.step(-1), one), isTrue);
      expect(identical(one.step(1), one), isTrue);
    });

    test('going home keeps the page underneath', () {
      final tab = const BrowserTab(id: 1).visit('https://a.example').goHome();

      expect(tab.atStart, isTrue);
      expect(tab.draft, isEmpty);

      // The stack is intact, so the trip is not one-way.
      expect(tab.url, 'https://a.example');
      expect(tab.entries, <String>['https://a.example']);
    });

    test('stepping comes back out of the start screen', () {
      final tab = const BrowserTab(id: 1)
          .visit('https://a.example')
          .visit('https://b.example')
          .goHome()
          .step(-1);

      expect(tab.atStart, isFalse);
      expect(tab.url, 'https://a.example');
    });

    test('reloading is a ticket that only ever changes', () {
      const tab = BrowserTab(id: 1);

      expect(tab.reloaded().reload, tab.reload + 1);
      expect(tab.reloaded().reloaded().reload, tab.reload + 2);
    });
  });

  group('site', () {
    test('a page is named by its host, without the www', () {
      expect(siteHost('https://www.example.com/path?q=1'), 'example.com');
      expect(siteHost('https://sub.example.com'), 'sub.example.com');
    });

    test('an unparseable address falls back to itself', () {
      expect(siteHost('not a url'), 'not a url');
      expect(siteIcon('not a url'), isEmpty);
    });

    test('the icon is asked of the site rather than of a service', () {
      expect(
        siteIcon('https://example.com/deep/page'),
        'https://example.com/favicon.ico',
      );
    });
  });

  group('BrowserController', () {
    test('starts with one tab at the start screen', () async {
      final browser = BrowserController(await freshStore());

      expect(browser.tabs, hasLength(1));
      expect(browser.tab.atStart, isTrue);
      expect(browser.view, BrowserView.mobile);
    });

    test('opening a tab brings it to the front', () async {
      final browser = BrowserController(await freshStore());

      final id = browser.open(url: 'https://a.example');

      expect(browser.tabs, hasLength(2));
      expect(browser.activeId, id);
      expect(browser.tab.url, 'https://a.example');
    });

    test('a closed tab never gives its id back', () async {
      final browser = BrowserController(await freshStore());

      final first = browser.open();

      browser.close(first);

      expect(browser.open(), isNot(first));
    });

    test('closing the tab in front hands over to its left', () async {
      final browser = BrowserController(await freshStore());

      final left = browser.open(url: 'https://left.example');
      final right = browser.open(url: 'https://right.example');

      browser.close(right);

      expect(browser.activeId, left);
    });

    test('closing the last tab leaves a fresh one, not none', () async {
      final browser = BrowserController(await freshStore());

      browser.close(browser.activeId);

      // A browser with nothing open has no state a screen can draw.
      expect(browser.tabs, hasLength(1));
      expect(browser.tab.atStart, isTrue);
    });

    test('visiting records the page', () async {
      final store = await freshStore();
      final browser = BrowserController(store);

      await browser.visit('https://a.example');

      expect(browser.tab.url, 'https://a.example');
      expect(browser.history.single.url, 'https://a.example');
    });

    test('a site opened again moves to the front rather than twice', () async {
      final browser = BrowserController(await freshStore());

      await browser.record('https://a.example');
      await browser.record('https://b.example');
      await browser.record('https://a.example');

      expect(browser.history.map((v) => v.url), <String>[
        'https://a.example',
        'https://b.example',
      ]);
    });

    test('the visit list stops at its limit', () async {
      final browser = BrowserController(await freshStore());

      for (var i = 0; i < historyLimit + 10; i += 1) {
        await browser.record('https://site$i.example');
      }

      expect(browser.history, hasLength(historyLimit));

      // The newest survive, which is the end of the list a shortcut grid is for.
      expect(
        browser.history.first.url,
        'https://site${historyLimit + 9}.example',
      );
    });

    test(
      'history survives a reopen in the shape the Tauri build reads',
      () async {
        final store = await freshStore();

        await BrowserController(store).record(
          'https://a.example',
          at: DateTime.fromMillisecondsSinceEpoch(1700000000000),
        );

        final raw = jsonDecode(store.getString(LegacyStore.keyBrowserHistory)!);

        expect(raw, <dynamic>[
          <String, dynamic>{'url': 'https://a.example', 'time': 1700000000000},
        ]);

        expect(
          BrowserController(store).history.single.url,
          'https://a.example',
        );
      },
    );

    test('clearing history removes the key rather than emptying it', () async {
      final store = await freshStore();
      final browser = BrowserController(store);

      await browser.record('https://a.example');
      await browser.clearHistory();

      expect(browser.history, isEmpty);
      expect(store.has(LegacyStore.keyBrowserHistory), isFalse);
    });

    test('an unreadable stored list is treated as no list', () async {
      final store = await freshStore();
      await store.setString(LegacyStore.keyBrowserHistory, 'not json');

      // A shortcut grid is not worth failing the start screen over.
      expect(BrowserController(store).history, isEmpty);
    });

    test('a row that does not parse is dropped without the list', () async {
      final store = await freshStore();
      await store.setString(
        LegacyStore.keyBrowserHistory,
        jsonEncode(<dynamic>[
          <String, dynamic>{'url': 'https://a.example', 'time': 1},
          <String, dynamic>{'url': ''},
          'nonsense',
        ]),
      );

      expect(BrowserController(store).history.single.url, 'https://a.example');
    });

    test('favourites are seeded only when untouched', () async {
      final store = await freshStore();

      expect(BrowserController(store).favorites, defaultFavorites);

      // Someone who removed every favourite is not asking for them back next launch.
      await BrowserController(store).setFavorites(const <BrowserFavorite>[]);

      expect(BrowserController(store).favorites, isEmpty);
    });

    test(
      'a favourite is edited by id, not by the field being changed',
      () async {
        final store = await freshStore();
        final browser = BrowserController(store);

        await browser.updateFavorite('google', url: 'https://duckduckgo.com');

        final edited = browser.favorites.firstWhere((f) => f.id == 'google');

        expect(edited.url, 'https://duckduckgo.com');
        expect(edited.name, 'Google');
        expect(browser.favorites, hasLength(defaultFavorites.length));
      },
    );

    test('the view preference survives a reopen', () async {
      final store = await freshStore();

      await BrowserController(store).setView(BrowserView.desktop);

      expect(BrowserController(store).view, BrowserView.desktop);
    });
  });
}
