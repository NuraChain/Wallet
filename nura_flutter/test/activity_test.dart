import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nura_wallet/application/history_controller.dart';
import 'package:nura_wallet/core/format.dart';
import 'package:nura_wallet/core/l10n/app_localizations.dart';
import 'package:nura_wallet/core/l10n/translations.dart';
import 'package:nura_wallet/data/cache/history_cache.dart';
import 'package:nura_wallet/data/repositories/goldrush_repository.dart';
import 'package:nura_wallet/data/repositories/history_repository.dart';
import 'package:nura_wallet/domain/chain/network.dart';
import 'package:nura_wallet/domain/chain/token.dart';
import 'package:nura_wallet/presentation/screens/activity_list.dart';
import 'package:nura_wallet/presentation/theme/app_theme.dart';

const String _me = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const String _other = '0x3222222222222222222222222222222222222222';

HistoryEntry _entry({
  String hash = '0xaaa',
  String symbol = 'Nura',
  String to = _me,
  String value = '1500000000000000000',
  int seconds = 1700000000,
}) => HistoryEntry(
  hash: hash,
  from: _other,
  to: to,
  value: BigInt.parse(value),
  decimals: 18,
  symbol: symbol,
  at: DateTime.fromMillisecondsSinceEpoch(seconds * 1000),
);

/// An explorer that answers `txlist` from a table and `tokentx` with nothing.
http.Client _explorer(List<Map<String, dynamic>> rows) {
  return MockClient((request) async {
    final action = request.url.queryParameters['action'];

    return http.Response(
      jsonEncode(<String, dynamic>{
        'status': '1',
        'result': action == 'txlist' ? rows : <dynamic>[],
      }),
      200,
    );
  });
}

Map<String, dynamic> _row({
  String hash = '0xaaa',
  String value = '1500000000000000000',
  String stamp = '1700000000',
}) => <String, dynamic>{
  'hash': hash,
  'from': _other,
  'to': _me,
  'value': value,
  'timeStamp': stamp,
};

/// Pumps a fixed number of frames rather than settling.
///
/// `pumpAndSettle` waits for an empty frame schedule, which a screen with a spinner or a blinking
/// cursor on it never reaches.
Future<void> _drain(WidgetTester tester, {int frames = 6}) async {
  for (int index = 0; index < frames; index += 1) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  group('formatUnits', () {
    test('formats from the integer, truncating rather than rounding', () {
      // 0.9999999 to six places is 0.999999, not 1. Rounding a transfer up shows an amount that was
      // never sent.
      expect(formatUnits(BigInt.parse('999999900000000000'), 18), '0.999999');
      expect(formatUnits(BigInt.parse('1500000000000000000'), 18), '1.5');
      expect(formatUnits(BigInt.from(2500000), 6), '2.5');
    });

    test('keeps every digit of a whole amount', () {
      // A balance too large for a double must survive intact.
      expect(
        formatUnits(BigInt.parse('123456789012345678901234567890'), 0),
        '123456789012345678901234567890',
      );
    });

    test('drops a fraction that rounds away to nothing', () {
      expect(formatUnits(BigInt.from(1), 18), '0');
    });

    test('carries a sign', () {
      expect(formatUnits(BigInt.from(-1500), 3), '-1.5');
    });
  });

  group('shortAddress', () {
    test('keeps the prefix and the tail', () {
      expect(shortAddress(_me), '0x9858…da94');
    });

    test('leaves a short string alone', () {
      expect(shortAddress('0x1234'), '0x1234');
    });
  });

  group('Persian calendar', () {
    // Dates whose Persian form is a matter of record, not of arithmetic.
    test('converts dates with a known Persian form', () {
      expect(toPersian(DateTime(1979, 2, 11)), (
        year: 1357,
        month: 11,
        day: 22,
      ), reason: 'the day the revolution succeeded');

      expect(toPersian(DateTime(2024, 3, 20)), (
        year: 1403,
        month: 1,
        day: 1,
      ), reason: 'Nowruz 1403');

      expect(toPersian(DateTime(2026, 3, 21)), (
        year: 1405,
        month: 1,
        day: 1,
      ), reason: 'Nowruz 1405');

      expect(toPersian(DateTime(2000, 1, 1)), (year: 1378, month: 10, day: 11));
    });

    test('the day before Nowruz is the last day of the old year', () {
      final eve = toPersian(DateTime(2024, 3, 19));

      expect(eve.year, 1402);
      expect(eve.month, 12);
      // 1402 was not a leap year, so Esfand had 29 days.
      expect(eve.day, 29);
    });

    test('runs continuously across a decade of days', () {
      // The strongest thing that can be said about a calendar without a second implementation to
      // check against: walk every day for ten years and the Persian date must advance by exactly one
      // each time, rolling months at their real lengths and years only at Nowruz. A leap rule that is
      // wrong anywhere shows up here as a repeated or a skipped day.
      var date = DateTime.utc(2020, 1, 1);
      var previous = toPersian(date);

      const lengths = <int>[31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

      for (int day = 0; day < 3653; day += 1) {
        date = date.add(const Duration(days: 1));

        final current = toPersian(date);

        expect(current.month, inInclusiveRange(1, 12));
        expect(current.day, inInclusiveRange(1, 31));

        if (current.day != previous.day + 1) {
          // A rollover: the previous day must have been the last of its month.
          expect(current.day, 1);
          expect(
            previous.day,
            anyOf(lengths[previous.month - 1], 30),
            reason: 'month \${previous.month} of \${previous.year} ended on \${previous.day}',
          );

          expect(current.month, previous.month == 12 ? 1 : previous.month + 1);

          expect(
            current.year,
            previous.month == 12 ? previous.year + 1 : previous.year,
          );
        } else {
          expect(current.month, previous.month);
          expect(current.year, previous.year);
        }

        previous = current;
      }
    });

    test('reads in Persian digits and month names', () {
      expect(
        formatDate(DateTime(2024, 3, 20), AppLanguage.fa),
        '۱ فروردین ۱۴۰۳',
      );
    });

    test('every other language reads its own calendar', () async {
      await initializeDateFormatting();

      // Not the Persian calendar, and not English month names either.
      expect(formatDate(DateTime(2024, 3, 20), AppLanguage.en), 'Mar 20, 2024');
      expect(
        formatDate(DateTime(2024, 3, 20), AppLanguage.fr),
        contains('2024'),
      );
    });
  });

  group('HistoryCache', () {
    late Directory root;
    late HistoryCache cache;

    setUp(() async {
      root = await Directory.systemTemp.createTemp('nura-history');
      cache = await HistoryCache.open(directory: root);
    });

    tearDown(() async {
      await root.delete(recursive: true);
    });

    final now = DateTime(2026, 1, 1, 12);

    test('an empty cache holds nothing', () {
      expect(cache.read('k', now: now), isNull);
    });

    test('what is written is what is read back', () async {
      await cache.write('k', <HistoryEntry>[_entry()], '', now: now);

      final hit = cache.read('k', now: now);

      expect(hit!.entries.single.hash, '0xaaa');
      expect(hit.entries.single.value, BigInt.parse('1500000000000000000'));
      expect(hit.fresh, isTrue);
    });

    test('a large amount survives the round trip exactly', () async {
      // Written as a string for this reason: through a JSON number it would come back rounded.
      final huge = BigInt.parse('123456789012345678901234567890');

      await cache.write(
        'k',
        <HistoryEntry>[_entry(value: huge.toString())],
        '',
        now: now,
      );

      final revived = await HistoryCache.open(directory: root);

      expect(revived.read('k', now: now)!.entries.single.value, huge);
    });

    test('goes stale on its own clock', () async {
      await cache.write('k', <HistoryEntry>[_entry()], '', now: now);

      expect(cache.read('k', now: now.add(HistoryCache.fresh))!.fresh, isTrue);

      final later = now.add(HistoryCache.fresh + const Duration(seconds: 1));

      // Still served — a stale list beats an empty screen — but the caller is told to revalidate.
      expect(cache.read('k', now: later)!.fresh, isFalse);
      expect(cache.read('k', now: later)!.entries, hasLength(1));
    });

    test('a second read merges rather than replaces', () async {
      await cache.write(
        'k',
        <HistoryEntry>[_entry(hash: '0xold', seconds: 1600000000)],
        '',
        now: now,
      );

      // The explorer answers a fixed window; a thinner later read must not lose the older row.
      final merged = await cache.write(
        'k',
        <HistoryEntry>[_entry(hash: '0xnew', seconds: 1700000000)],
        '',
        now: now,
      );

      expect(merged.map((e) => e.hash), <String>['0xnew', '0xold']);
    });

    test('the same movement twice is one row', () async {
      await cache.write('k', <HistoryEntry>[_entry()], '', now: now);

      final merged = await cache.write(
        'k',
        <HistoryEntry>[_entry()],
        '',
        now: now,
      );

      expect(merged, hasLength(1));
    });

    test('one hash in two assets is two rows', () async {
      // A transfer paid for in the chain's own coin produces a native row and a token row under the
      // same hash. Keying on the hash alone would drop one of them.
      final merged = await cache.write(
        'k',
        <HistoryEntry>[_entry(), _entry(symbol: 'USDC')],
        '',
        now: now,
      );

      expect(merged, hasLength(2));
    });

    test('the reason is stored beside the rows', () async {
      await cache.write('k', const <HistoryEntry>[], 'rate limited', now: now);

      final revived = await HistoryCache.open(directory: root);

      // Without this, "unreadable" becomes "no transactions" on the next launch.
      expect(revived.read('k', now: now)!.notice, 'rate limited');
    });

    test('evicts the least recently used once over capacity', () async {
      for (int index = 0; index < HistoryCache.capacity + 2; index += 1) {
        await cache.write(
          'key$index',
          <HistoryEntry>[_entry()],
          '',
          now: now.add(Duration(seconds: index)),
        );
      }

      expect(cache.read('key0', now: now), isNull);
      expect(cache.read('key1', now: now), isNull);
      expect(cache.read('key2', now: now), isNotNull);
    });

    test('reading counts as a use', () async {
      for (int index = 0; index < HistoryCache.capacity; index += 1) {
        await cache.write(
          'key$index',
          <HistoryEntry>[_entry()],
          '',
          now: now.add(Duration(seconds: index)),
        );
      }

      // key0 is the coldest, so touching it should save it from the next eviction.
      cache.read('key0', now: now.add(const Duration(hours: 1)));

      await cache.write(
        'fresh',
        <HistoryEntry>[_entry()],
        '',
        now: now.add(const Duration(hours: 2)),
      );

      expect(cache.read('key0', now: now), isNotNull);
      expect(cache.read('key1', now: now), isNull);
    });

    test('a corrupt file costs the cache, not the launch', () async {
      await File('${root.path}/${HistoryCache.fileName}').writeAsString('{[');

      final revived = await HistoryCache.open(directory: root);

      expect(revived.read('k', now: now), isNull);
    });

    test('keys separate accounts, chains and explorers', () {
      expect(
        HistoryCache.keyFor(_me, 1, 'a'),
        HistoryCache.keyFor(_me.toLowerCase(), 1, 'a'),
        reason: 'one account must not be filed under two spellings of itself',
      );

      expect(
        HistoryCache.keyFor(_me, 1, 'a'),
        isNot(HistoryCache.keyFor(_me, 56, 'a')),
      );

      // A custom network's API can be edited, and the old answer is not the new endpoint's answer.
      expect(
        HistoryCache.keyFor(_me, 1, 'a'),
        isNot(HistoryCache.keyFor(_me, 1, 'b')),
      );
    });
  });

  group('HistoryController', () {
    late Directory root;
    late HistoryCache cache;

    final chain = defaultNetworks.first;

    setUp(() async {
      root = await Directory.systemTemp.createTemp('nura-history-c');
      cache = await HistoryCache.open(directory: root);
    });

    tearDown(() async {
      await root.delete(recursive: true);
    });

    /// A controller reading through [client], with the paid fallback switched off.
    HistoryController build(http.Client client) => HistoryController(
      cache,
      explorer: (network) => HistoryRepository(network, client: client),
      fallback: GoldRushRepository(key: '', client: client),
    );

    test('reads and holds the rows', () async {
      final history = build(_explorer(<Map<String, dynamic>>[_row()]));

      await history.load(_me, chain, const <Token>[]);

      expect(history.entries, hasLength(1));
      expect(history.isLoading, isFalse);
      expect(history.notice, isEmpty);
    });

    test(
      'a second read inside the window does not go to the network',
      () async {
        int calls = 0;

        final history = build(
          MockClient((request) async {
            calls += 1;

            return http.Response(
              jsonEncode(<String, dynamic>{
                'result': <dynamic>[_row()],
              }),
              200,
            );
          }),
        );

        await history.load(_me, chain, const <Token>[]);

        final first = calls;

        await history.load(_me, chain, const <Token>[]);

        expect(calls, first, reason: 'a fresh entry answers on its own');
      },
    );

    test('a forced read always goes to the network', () async {
      int calls = 0;

      final history = build(
        MockClient((request) async {
          calls += 1;

          return http.Response(
            jsonEncode(<String, dynamic>{
              'result': <dynamic>[_row()],
            }),
            200,
          );
        }),
      );

      await history.load(_me, chain, const <Token>[]);

      final first = calls;

      // The point of a refresh is to distrust what is held.
      await history.load(_me, chain, const <Token>[], force: true);

      expect(calls, greaterThan(first));
    });

    test('concurrent reads of one key make one request each', () async {
      int calls = 0;

      final history = build(
        MockClient((request) async {
          calls += 1;

          return http.Response(
            jsonEncode(<String, dynamic>{'result': <dynamic>[]}),
            200,
          );
        }),
      );

      await Future.wait(<Future<void>>[
        history.load(_me, chain, const <Token>[]),
        history.load(_me, chain, const <Token>[]),
        history.load(_me, chain, const <Token>[]),
      ]);

      // Two actions, asked once — not three times over, against a rate-limited explorer.
      expect(calls, 2);
    });

    test('a failure keeps the rows that were already held', () async {
      await build(_explorer(<Map<String, dynamic>>[_row()]))
          .load(_me, chain, const <Token>[]);

      final history = build(
        MockClient((_) async => http.Response('nope', 503)),
      );

      await history.load(_me, chain, const <Token>[], force: true);

      // A dropped connection must not turn a populated list into an empty one.
      expect(history.entries, hasLength(1));
    });

    test('a transport failure is reported as offline', () async {
      final history = build(
        MockClient((_) async => throw const SocketException('no route')),
      );

      await history.load(_me, chain, const <Token>[]);

      expect(history.isOffline, isTrue);
    });

    test('an explorer that answers is not offline, whatever it says', () async {
      final history = build(
        MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'status': '0',
              'result': 'Max rate limit reached',
            }),
            200,
          ),
        ),
      );

      await history.load(_me, chain, const <Token>[]);

      expect(history.isOffline, isFalse);
      expect(history.notice, 'Max rate limit reached');
    });

    test('switching account drops the previous rows', () async {
      final history = build(_explorer(<Map<String, dynamic>>[_row()]));

      await history.load(_me, chain, const <Token>[]);

      expect(history.entries, hasLength(1));

      // A list that stays put while the header changes reads as this account's history.
      await history.load(_other, chain, const <Token>[]);

      expect(history.entries.map((e) => e.hash), everyElement(isNotNull));
      expect(
        HistoryCache.keyFor(_other, chain.chainId, chain.explorerApiBase),
        isNot(HistoryCache.keyFor(_me, chain.chainId, chain.explorerApiBase)),
      );
    });

    test('forgetting clears the rows and the file', () async {
      final history = build(_explorer(<Map<String, dynamic>>[_row()]));

      await history.load(_me, chain, const <Token>[]);
      await history.forget();

      expect(history.entries, isEmpty);
      expect(
        cache.read(
          HistoryCache.keyFor(_me, chain.chainId, chain.explorerApiBase),
          now: DateTime(2026),
        ),
        isNull,
      );
    });
  });

  group('GoldRush fallback', () {
    test('is not asked at all without a key', () async {
      final fallback = GoldRushRepository(
        key: '',
        client: MockClient((_) async => throw StateError('must not be asked')),
      );

      expect(fallback.covers(56), isFalse);

      final answer = await fallback.read(_me, defaultNetworks.first, const []);

      expect(answer.entries, isEmpty);
    });
  });

  group('ActivityList', () {
    late HistoryController history;
    late Directory root;

    Future<void> mount(
      WidgetTester tester, {
      required http.Client client,
      Locale locale = const Locale('en'),
    }) async {
      await tester.runAsync(() async {
        root = await Directory.systemTemp.createTemp('nura-history-w');

        history = HistoryController(
          await HistoryCache.open(directory: root),
          explorer: (network) => HistoryRepository(network, client: client),
          fallback: GoldRushRepository(key: '', client: client),
        );

        await initializeDateFormatting();

        for (final language in AppLanguage.values) {
          await AppLocalizations.preload(language);
        }

        await history.load(_me, defaultNetworks.first, const <Token>[]);
      });

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          locale: locale,
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
            AppLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Scaffold(
            body: SingleChildScrollView(
              child: ActivityList(
                history: history,
                address: _me,
                onOpen: (_) {},
              ),
            ),
          ),
        ),
      );

      await _drain(tester);
    }

    tearDown(() async {
      if (await root.exists()) {
        await root.delete(recursive: true);
      }
    });

    testWidgets('draws a received transfer with its counterparty', (
      tester,
    ) async {
      await mount(tester, client: _explorer(<Map<String, dynamic>>[_row()]));

      expect(find.text('Received'), findsOneWidget);
      expect(find.text(shortAddress(_other)), findsOneWidget);
      expect(find.text('+1.5 Nura'), findsOneWidget);
    });

    testWidgets('shows only a preview of a long list', (tester) async {
      await mount(
        tester,
        client: _explorer(<Map<String, dynamic>>[
          for (int index = 0; index < 12; index += 1)
            _row(hash: '0x$index', stamp: '${1700000000 + index}'),
        ]),
      );

      // The wallet tab is a glance; the full list lives behind the overview.
      expect(find.text('Received'), findsNWidgets(5));
    });

    testWidgets('an empty account is empty, not broken', (tester) async {
      await mount(tester, client: _explorer(const <Map<String, dynamic>>[]));

      expect(find.text('No transactions yet'), findsOneWidget);
    });

    testWidgets('an explorer that refuses says so instead', (tester) async {
      await mount(
        tester,
        client: MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'status': '0',
              'result': 'Max rate limit reached, please use an API key',
            }),
            200,
          ),
        ),
      );

      expect(
        find.text("This network's explorer could not provide the history."),
        findsOneWidget,
      );

      // The explorer's own sentence is third-party marketing copy, not something to show a user.
      expect(find.textContaining('API key'), findsNothing);
    });

    testWidgets('an unreachable explorer says the link is down', (
      tester,
    ) async {
      await mount(
        tester,
        client: MockClient((_) async => throw const SocketException('down')),
      );

      expect(
        find.text('History cannot be loaded while offline.'),
        findsOneWidget,
      );
    });

    testWidgets('the overview opens with the full list and searches it', (
      tester,
    ) async {
      await mount(
        tester,
        client: _explorer(<Map<String, dynamic>>[
          for (int index = 0; index < 8; index += 1)
            _row(hash: '0xhash$index', stamp: '${1700000000 + index}'),
        ]),
      );

      await tester.tap(find.text('Full History'));
      await _drain(tester);

      expect(find.text('8 transactions'), findsOneWidget);

      await tester.enterText(find.byType(TextField), '0xhash3');
      await _drain(tester);

      expect(find.text('1 transactions'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'nothing matches this');
      await _drain(tester);

      expect(find.text('No transactions match your search'), findsOneWidget);
    });

    testWidgets('the overview filters by direction', (tester) async {
      await mount(tester, client: _explorer(<Map<String, dynamic>>[_row()]));

      await tester.tap(find.text('Full History'));
      await _drain(tester);

      await tester.tap(find.text('Sent'));
      await _drain(tester);

      // The only row is incoming, so filtering to sent must leave nothing.
      expect(find.text('0 transactions'), findsOneWidget);
    });

    testWidgets('a Persian date reads on the Persian calendar', (tester) async {
      await mount(
        tester,
        locale: const Locale('fa'),
        client: _explorer(<Map<String, dynamic>>[
          // 20 March 2024, which is 1 Farvardin 1403.
          _row(stamp: '1710892800'),
        ]),
      );

      expect(find.textContaining('فروردین'), findsOneWidget);
    });
  });
}
