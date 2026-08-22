import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/application/session_controller.dart';
import 'package:nura_wallet/core/l10n/app_localizations.dart';
import 'package:nura_wallet/core/l10n/translations.dart';
import 'package:nura_wallet/data/storage/app_store.dart';
import 'package:nura_wallet/data/storage/legacy_store.dart';
import 'package:nura_wallet/domain/wallet/account.dart';
import 'package:nura_wallet/presentation/screens/account_sheet.dart';
import 'package:nura_wallet/presentation/theme/app_theme.dart';

Map<String, dynamic> _vectors() =>
    jsonDecode(File('test/vectors/reference_vectors.json').readAsStringSync())
        as Map<String, dynamic>;

Future<void> _drain(WidgetTester tester, {int frames = 10}) async {
  for (int index = 0; index < frames; index += 1) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  final vectors = _vectors();

  final phrase =
      (vectors['hdDerivation'] as Map<String, dynamic>)['mnemonic'] as String;

  final derived =
      (vectors['hdDerivation'] as Map<String, dynamic>)['accounts']
          as List<dynamic>;

  late Directory root;

  Future<AppStore> freshStore() =>
      AppStore.open(directory: root, legacyCandidates: const <File>[]);

  setUp(() async {
    root = await Directory.systemTemp.createTemp('nura-accounts');
  });

  tearDown(() async {
    await root.delete(recursive: true);
  });

  group('AccountList', () {
    test('an absent list is the one account every wallet starts with', () {
      final accounts = AccountList.decode(null);

      expect(accounts.length, 1);
      expect(accounts.accounts.single.index, 0);
      expect(accounts.accounts.single.name, isEmpty);
    });

    test('a pre-multi-account wallet keeps the name it was given', () {
      // Wallets created before the switcher existed stored a single `Wallet.Name`.
      final accounts = AccountList.decode(null, legacyName: 'My Wallet');

      expect(accounts.accounts.single.name, 'My Wallet');
    });

    test('round-trips through the stored shape', () {
      final list = AccountList(const <Account>[
        Account(index: 0, name: 'Main'),
        Account(index: 3, name: 'Savings', emoji: '💎'),
      ]);

      final revived = AccountList.decode(list.encode());

      expect(revived.length, 2);
      expect(revived.at(3)!.name, 'Savings');
      expect(revived.at(3)!.emoji, '💎');
      expect(revived.at(0)!.emoji, isNull);
    });

    test('an unnamed account is stored with the field, not without it', () {
      // The Tauri loader drops any entry with no `name` key at all, so writing one without it would
      // make the account vanish on a rollback.
      final encoded = const AccountList(<Account>[Account(index: 1)]).encode();

      expect(jsonDecode(encoded), <dynamic>[
        <String, dynamic>{'index': 1, 'name': ''},
      ]);
    });

    test('a cleared badge is absent rather than blank', () {
      final encoded = AccountList(const <Account>[
        Account(index: 0, name: '', emoji: ''),
      ]).encode();

      expect(
        (jsonDecode(encoded) as List<dynamic>).first,
        isNot(contains('emoji')),
      );
    });

    test('reads in index order however it was written', () {
      final revived = AccountList.decode(
        jsonEncode(<Map<String, dynamic>>[
          <String, dynamic>{'index': 7, 'name': ''},
          <String, dynamic>{'index': 2, 'name': ''},
        ]),
      );

      expect(revived.accounts.map((a) => a.index), <int>[2, 7]);
    });

    test('a duplicate index yields one row', () {
      // Two rows deriving one address would leave the second unreachable in the switcher.
      final revived = AccountList.decode(
        jsonEncode(<Map<String, dynamic>>[
          <String, dynamic>{'index': 1, 'name': 'first'},
          <String, dynamic>{'index': 1, 'name': 'second'},
        ]),
      );

      expect(revived.length, 1);
      expect(revived.at(1)!.name, 'first');
    });

    test('drops entries a wallet could not act on', () {
      final revived = AccountList.decode(
        jsonEncode(<Map<String, dynamic>>[
          <String, dynamic>{'index': 'two', 'name': ''},
          <String, dynamic>{'index': -1, 'name': ''},
          <String, dynamic>{'index': Account.limit, 'name': ''},
          <String, dynamic>{'index': 4},
          <String, dynamic>{'index': 5, 'name': 'kept'},
        ]),
      );

      expect(revived.accounts.map((a) => a.index), <int>[5]);
    });

    test('an over-long badge is dropped, and the account is not', () {
      final revived = AccountList.decode(
        jsonEncode(<Map<String, dynamic>>[
          <String, dynamic>{'index': 0, 'name': 'x', 'emoji': 'y' * 40},
        ]),
      );

      expect(revived.at(0)!.name, 'x');
      expect(revived.at(0)!.emoji, isNull);
    });

    test('a corrupt list costs the accounts, not the wallet', () {
      expect(AccountList.decode('not json').length, 1);
      expect(AccountList.decode('{}').length, 1);
      expect(AccountList.decode('[]').accounts.single.index, 0);
    });
  });

  group('SessionController accounts', () {
    Future<SessionController> unlocked({String? secret}) async {
      final session = SessionController(await freshStore());

      await session.restore();
      await session.adopt(secret ?? phrase, 'hunter2');

      return session;
    }

    test('a new wallet opens with one account', () async {
      final session = await unlocked();

      expect(session.accounts, hasLength(1));
      expect(session.account, 0);
      expect(session.address, derived[0]['address']);
    });

    test('selecting a new index creates it and switches to it', () async {
      final session = await unlocked();

      await session.selectAccount(2);

      expect(session.account, 2);
      expect(session.accounts.map((a) => a.index), <int>[0, 2]);
      // The whole point: the address is the one the phrase always implied for that index.
      expect(session.address, derived[2]['address']);
    });

    test('an account survives a lock and a reopen', () async {
      final store = await freshStore();
      final session = SessionController(store);

      await session.restore();
      await session.adopt(phrase, 'hunter2');
      await session.selectAccount(2);
      await session.renameAccount(2, 'Savings');
      await session.badgeAccount(2, '💎');

      session.lock();

      // The list belongs to an open wallet, so it goes with the secret.
      expect(session.accounts, isEmpty);

      expect(await session.unlock('hunter2'), isNull);

      expect(session.account, 2);
      expect(session.accounts.map((a) => a.index), <int>[0, 2]);
      expect(session.accounts.last.name, 'Savings');
      expect(session.accounts.last.emoji, '💎');
    });

    test('a stored index the list does not hold opens on account 0', () async {
      // What the Tauri loader does too: an active index with no row behind it would show an address
      // the switcher cannot get back to.
      final store = await freshStore();

      final session = SessionController(store);

      await session.restore();
      await session.adopt(phrase, 'hunter2');

      await store.setString(LegacyStore.keyActive, '7');

      session.lock();

      expect(await session.unlock('hunter2'), isNull);
      expect(session.account, 0);
    });

    test('a blank name is stored, so a label can be undone', () async {
      final session = await unlocked();

      await session.renameAccount(0, 'Main');
      await session.renameAccount(0, '   ');

      expect(session.accounts.single.name, isEmpty);
    });

    test('a badge can be cleared back to nothing', () async {
      final session = await unlocked();

      await session.badgeAccount(0, '🦊');
      await session.badgeAccount(0, null);

      expect(session.accounts.single.emoji, isNull);
      expect(session.accounts.single.hasBadge, isFalse);
    });

    test('an index outside the range is refused', () async {
      final session = await unlocked();

      await session.selectAccount(Account.limit);
      await session.selectAccount(-1);

      expect(session.account, 0);
      expect(session.accounts, hasLength(1));
    });

    test('a private-key wallet holds exactly one account', () async {
      final imported = vectors['privateKeyImport'] as Map<String, dynamic>;

      final session = await unlocked(secret: imported['privateKey'] as String);

      expect(session.derivable, isFalse);
      expect(session.accounts, hasLength(1));

      // No index yields another key, so the switcher must not be able to move.
      await session.selectAccount(3);

      expect(session.account, 0);
      expect(session.accounts, hasLength(1));
    });

    test(
      'a private-key wallet ignores a list left by a phrase wallet',
      () async {
        final store = await freshStore();

        await store.setString(
          LegacyStore.keyAccounts,
          jsonEncode(<Map<String, dynamic>>[
            <String, dynamic>{'index': 0, 'name': ''},
            <String, dynamic>{'index': 5, 'name': 'stale'},
          ]),
        );

        final imported = vectors['privateKeyImport'] as Map<String, dynamic>;

        final session = SessionController(store);

        await session.restore();
        await session.adopt(imported['privateKey'] as String, 'hunter2');

        // Rows this vault cannot sign for must not be offered.
        expect(session.accounts, hasLength(1));
      },
    );

    test('an address can be derived for an index not yet added', () async {
      final session = await unlocked();

      // This is what the add form previews, before the account exists.
      expect(session.addressOfAccount(3), derived[3]['address']);
      expect(session.accounts, hasLength(1));
    });

    test('no address is derivable while locked', () async {
      final session = await unlocked();

      session.lock();

      expect(session.addressOfAccount(0), isNull);
    });
  });

  group('AccountSheet', () {
    late SessionController session;

    Future<void> mount(
      WidgetTester tester, {
      String? secret,
      Locale locale = const Locale('en'),
    }) async {
      await tester.runAsync(() async {
        session = SessionController(await freshStore());

        await session.restore();
        await session.adopt(secret ?? phrase, 'hunter2');

        for (final language in AppLanguage.values) {
          await AppLocalizations.preload(language);
        }
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
          home: Scaffold(body: AccountSheet(session: session)),
        ),
      );

      await _drain(tester);
    }

    testWidgets('lists the accounts with their addresses', (tester) async {
      await mount(tester);

      expect(find.text('Accounts'), findsOneWidget);
      expect(find.text('Account 1'), findsOneWidget);
      expect(find.textContaining('0x9858'), findsOneWidget);
    });

    testWidgets('an unnamed account is labelled in the active language', (
      tester,
    ) async {
      await mount(tester, locale: const Locale('fa'));

      // Stored blank and localised on the way out, so switching language relabels the defaults
      // rather than leaving a list frozen in the language they were made in.
      expect(find.text('حساب 1'), findsOneWidget);
    });

    testWidgets('adding refuses an index outside the range', (tester) async {
      await mount(tester);

      await tester.tap(find.text('Add account'));
      await _drain(tester);

      await tester.enterText(find.byType(TextField), '0');
      await tester.tap(find.text('Add'));
      await _drain(tester);

      // Index 0 always exists, so the form starts at one.
      expect(
        find.text('Enter a whole number between 1 and 99'),
        findsOneWidget,
      );
      expect(session.accounts, hasLength(1));
    });

    testWidgets('adding previews the address before it exists', (tester) async {
      await mount(tester);

      await tester.tap(find.text('Add account'));
      await _drain(tester);

      await tester.enterText(find.byType(TextField), '3');
      await _drain(tester);

      // The index is the only thing identifying the account, so the address is shown in full.
      expect(find.text(derived[3]['address'] as String), findsOneWidget);
    });

    testWidgets('adding an index creates it and switches to it', (
      tester,
    ) async {
      await mount(tester);

      await tester.tap(find.text('Add account'));
      await _drain(tester);

      await tester.enterText(find.byType(TextField), '3');
      await tester.tap(find.text('Add'));
      await _drain(tester);

      expect(session.account, 3);
      expect(session.accounts.map((a) => a.index), <int>[0, 3]);
    });

    testWidgets('an index already in the list is refused by name', (
      tester,
    ) async {
      await mount(tester);

      await tester.runAsync(() => session.selectAccount(2));
      await _drain(tester);

      await tester.tap(find.text('Add account'));
      await _drain(tester);

      await tester.enterText(find.byType(TextField), '2');
      await tester.tap(find.text('Add'));
      await _drain(tester);

      expect(find.text('That index is already in your list'), findsOneWidget);
    });

    testWidgets('renaming an account keeps the new label', (tester) async {
      await mount(tester);

      await tester.tap(find.bySemanticsLabel('Rename account'));
      await _drain(tester);

      await tester.enterText(find.byType(TextField), 'Everyday');
      await tester.tap(find.text('Save'));
      await _drain(tester);

      expect(session.accounts.single.name, 'Everyday');
      expect(find.text('Everyday'), findsOneWidget);
    });

    testWidgets('a badge can be picked and cleared', (tester) async {
      await mount(tester);

      // The disc carries both an accessible name and its visible index, and the two merge into one
      // semantics node — so this matches on the label rather than equalling it.
      await tester.tap(find.bySemanticsLabel(RegExp('Pick an icon')));
      await _drain(tester);

      await tester.tap(find.text('🦊'));
      await _drain(tester);

      expect(session.accounts.single.emoji, '🦊');

      await tester.tap(find.bySemanticsLabel(RegExp('Pick an icon')));
      await _drain(tester);

      await tester.tap(find.text('Use the number'));
      await _drain(tester);

      expect(session.accounts.single.emoji, isNull);
    });

    testWidgets('a private-key wallet is told why it cannot add', (
      tester,
    ) async {
      final imported = vectors['privateKeyImport'] as Map<String, dynamic>;

      await mount(tester, secret: imported['privateKey'] as String);

      // Withheld rather than shown and then refused, with a line saying why — an absent button
      // explains nothing on its own.
      expect(find.text('Add account'), findsNothing);
      expect(
        find.text(
          'This wallet was imported from a private key, so it has a single account.',
        ),
        findsOneWidget,
      );
    });
  });
}
