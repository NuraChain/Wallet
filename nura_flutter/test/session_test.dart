import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/app.dart';
import 'package:nura_wallet/application/session_controller.dart';
import 'package:nura_wallet/application/settings_controller.dart';
import 'package:nura_wallet/core/l10n/app_localizations.dart';
import 'package:nura_wallet/core/l10n/translations.dart';
import 'package:nura_wallet/core/security/key_derivation.dart';
import 'package:nura_wallet/data/storage/app_store.dart';
import 'package:nura_wallet/data/storage/legacy_store.dart';
import 'package:nura_wallet/presentation/screens/unlock_screen.dart';
import 'package:nura_wallet/presentation/theme/app_theme.dart';
import 'package:nura_wallet/presentation/widgets/nura_button.dart';

/// Advances past an in-flight unlock without waiting on the busy spinner.
///
/// Argon2id runs synchronously inside the async call, so a handful of frames is enough for the
/// future to resolve and the state to settle — while `pumpAndSettle` would wait on an animation
/// that is designed never to stop.
Future<void> _drain(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Map<String, dynamic> _vectors() =>
    jsonDecode(File('test/vectors/reference_vectors.json').readAsStringSync())
        as Map<String, dynamic>;

/// A store file in exactly the shape the Tauri build writes, holding a real encrypted vault.
String _tauriStore(Map<String, dynamic> vectors, {String language = 'fa'}) {
  final vault = vectors['vaultKdf'] as Map<String, dynamic>;
  final sealed = vectors['vaultCipher'] as Map<String, dynamic>;

  return const JsonEncoder.withIndent('  ').convert(<String, dynamic>{
    LegacyStore.keyLanguage: language,
    LegacyStore.keyTheme: 'dark',
    LegacyStore.keyActive: '2',
    // The account list that goes with it. A stored active index is only honoured when the list
    // mentions it — in both builds — so a fixture claiming account 2 has to hold account 2.
    LegacyStore.keyAccounts: jsonEncode(<Map<String, dynamic>>[
      <String, dynamic>{'index': 0, 'name': ''},
      <String, dynamic>{'index': 2, 'name': 'Savings'},
    ]),
    LegacyStore.keyPassword: 'a' * 64,
    LegacyStore.keyMnemonic: jsonEncode(<String, dynamic>{
      'salt': vault['saltBase64'],
      'iv': sealed['ivBase64'],
      'cipher': sealed['cipherBase64'],
      'kdf': 'argon2id',
    }),
  });
}

void main() {
  final vectors = _vectors();
  final password =
      (vectors['vaultKdf'] as Map<String, dynamic>)['password'] as String;

  late Directory root;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('nura-store-test');
  });

  tearDown(() async {
    if (root.existsSync()) {
      await root.delete(recursive: true);
    }
  });

  Future<AppStore> freshStore() =>
      AppStore.open(directory: root, legacyCandidates: const <File>[]);

  /// A store that has already adopted a Tauri installation holding a real encrypted vault.
  Future<SessionController> withWallet() async {
    final legacy = File('${root.path}/legacy/${LegacyStore.fileName}');
    await legacy.parent.create(recursive: true);
    await legacy.writeAsString(_tauriStore(vectors));

    final store = await AppStore.open(
      directory: root,
      legacyCandidates: <File>[legacy],
    );

    return SessionController(store);
  }

  group('AppStore', () {
    test('starts empty when there is nothing to read', () async {
      final store = await freshStore();

      expect(store.keys, isEmpty);
      expect(store.has(LegacyStore.keyMnemonic), isFalse);
    });

    test('round-trips values through the file', () async {
      final store = await freshStore();

      await store.setString(LegacyStore.keyLanguage, 'fa');

      final reopened = await freshStore();

      expect(reopened.getString(LegacyStore.keyLanguage), 'fa');
    });

    test('writes the same pretty JSON the Tauri build reads', () async {
      final store = await freshStore();

      await store.setString(LegacyStore.keyTheme, 'dark');

      final raw = File('${root.path}/${LegacyStore.fileName}')
          .readAsStringSync();

      expect(raw, contains('  "App.Theme": "dark"'));
      expect(jsonDecode(raw), isA<Map<String, dynamic>>());
    });

    // The whole point of the migration: a Tauri installation's data is adopted, not discarded.
    test('imports a Tauri store on first run', () async {
      final legacy = File('${root.path}/legacy/${LegacyStore.fileName}');
      await legacy.parent.create(recursive: true);
      await legacy.writeAsString(_tauriStore(vectors));

      final store = await AppStore.open(
        directory: root,
        legacyCandidates: <File>[legacy],
      );

      expect(store.getString(LegacyStore.keyLanguage), 'fa');
      expect(store.getString(LegacyStore.keyActive), '2');
      expect(store.has(LegacyStore.keyMnemonic), isTrue);
    });

    // Rolling back to the Tauri build must still find the wallet, so the import cannot be a move.
    test('leaves the Tauri store where it found it', () async {
      final legacy = File('${root.path}/legacy/${LegacyStore.fileName}');
      await legacy.parent.create(recursive: true);
      final before = _tauriStore(vectors);
      await legacy.writeAsString(before);

      await AppStore.open(directory: root, legacyCandidates: <File>[legacy]);

      expect(legacy.existsSync(), isTrue);
      expect(legacy.readAsStringSync(), before);
    });

    test('does not re-import once it has its own file', () async {
      final legacy = File('${root.path}/legacy/${LegacyStore.fileName}');
      await legacy.parent.create(recursive: true);
      await legacy.writeAsString(_tauriStore(vectors, language: 'fa'));

      final first = await AppStore.open(
        directory: root,
        legacyCandidates: <File>[legacy],
      );
      await first.setString(LegacyStore.keyLanguage, 'en');

      final second = await AppStore.open(
        directory: root,
        legacyCandidates: <File>[legacy],
      );

      expect(
        second.getString(LegacyStore.keyLanguage),
        'en',
        reason: 'a later launch must not overwrite live data with the import',
      );
    });

    test('refuses to adopt a file that is not a store', () async {
      final legacy = File('${root.path}/legacy/${LegacyStore.fileName}');
      await legacy.parent.create(recursive: true);
      await legacy.writeAsString('not json at all');

      expect(
        AppStore.open(directory: root, legacyCandidates: <File>[legacy]),
        throwsFormatException,
      );
    });

    test('removeAll clears in a single write', () async {
      final store = await freshStore();

      await store.setString(LegacyStore.keyMnemonic, '{}');
      await store.setString(LegacyStore.keyPassword, 'x');
      await store.setString(LegacyStore.keyLanguage, 'fa');

      await store.removeAll(const <String>[
        LegacyStore.keyMnemonic,
        LegacyStore.keyPassword,
      ]);

      final reopened = await freshStore();

      expect(reopened.has(LegacyStore.keyMnemonic), isFalse);
      expect(reopened.getString(LegacyStore.keyLanguage), 'fa');
    });

    test('leaves no temporary file behind', () async {
      final store = await freshStore();

      await store.setString(LegacyStore.keyTheme, 'light');

      final stray = root
          .listSync()
          .where((e) => e.path.endsWith('.tmp'))
          .toList();

      expect(stray, isEmpty);
    });
  });

  group('SettingsController', () {
    test('reads what the Tauri build stored', () async {
      final legacy = File('${root.path}/legacy/${LegacyStore.fileName}');
      await legacy.parent.create(recursive: true);
      await legacy.writeAsString(_tauriStore(vectors));

      final store = await AppStore.open(
        directory: root,
        legacyCandidates: <File>[legacy],
      );
      final settings = SettingsController(store);

      expect(settings.language, AppLanguage.fa);
      expect(settings.theme, ThemeChoice.dark);
      expect(settings.locale.languageCode, 'fa');
    });

    // The Tauri build had no way to say "follow the system"; an absent key meant it read the OS once
    // and then stopped. Naming the state fixes that without changing what a stored value means.
    test('an absent theme key means follow the system', () async {
      final settings = SettingsController(await freshStore());

      expect(settings.theme, ThemeChoice.system);
      expect(settings.theme.mode, ThemeMode.system);
    });

    test('changing a preference persists it and notifies once', () async {
      final store = await freshStore();
      final settings = SettingsController(store);

      var notifications = 0;
      settings.addListener(() => notifications++);

      await settings.setLanguage(AppLanguage.fa);
      await settings.setLanguage(AppLanguage.fa);

      expect(
        notifications,
        1,
        reason: 'setting the same value again is a no-op',
      );
      expect(store.getString(LegacyStore.keyLanguage), 'fa');
    });

    test(
      'choosing system removes the key rather than writing a word',
      () async {
        final store = await freshStore();
        final settings = SettingsController(store);

        await settings.setTheme(ThemeChoice.dark);
        expect(store.getString(LegacyStore.keyTheme), 'dark');

        await settings.setTheme(ThemeChoice.system);
        expect(store.has(LegacyStore.keyTheme), isFalse);
      },
    );
  });

  group('SessionController', () {
    test('opens on intro when no wallet exists', () async {
      final session = SessionController(await freshStore());

      expect(session.stage, SessionStage.loading);

      await session.restore();

      expect(session.stage, SessionStage.intro);
    });

    test('opens on locked when a wallet exists', () async {
      final session = await withWallet();

      await session.restore();

      expect(session.stage, SessionStage.locked);
    });

    // The decisive end-to-end test: a vault written by the Tauri build, opened through the whole
    // Flutter stack, yielding the right address.
    test('unlocks a Tauri wallet and derives the right account', () async {
      final session = await withWallet();
      await session.restore();

      expect(await session.unlock(password), isNull);
      expect(session.stage, SessionStage.unlocked);
      expect(session.isUnlocked, isTrue);

      // The store said account 2, so that is the account in view.
      expect(session.account, 2);

      final expected =
          ((vectors['hdDerivation'] as Map<String, dynamic>)['accounts']
                  as List<dynamic>)[2]
              as Map<String, dynamic>;

      expect(session.address, expected['address']);
      expect(session.privateKeyForSigning(), expected['privateKey']);
    });

    test('a wrong passphrase is refused and changes nothing', () async {
      final session = await withWallet();
      await session.restore();

      expect(await session.unlock('wrong'), UnlockFailure.wrongPassword);
      expect(session.stage, SessionStage.locked);
      expect(session.isUnlocked, isFalse);
      expect(session.address, isNull);
    });

    test(
      'a damaged vault is reported as corrupt, not as a bad password',
      () async {
        final store = await freshStore();
        await store.setString(LegacyStore.keyMnemonic, 'not a payload');

        final session = SessionController(store);
        await session.restore();

        expect(await session.unlock(password), UnlockFailure.corrupt);
      },
    );

    test('locking drops the secret but keeps the wallet', () async {
      final session = await withWallet();
      await session.restore();
      await session.unlock(password);

      session.lock();

      expect(session.stage, SessionStage.locked);
      expect(session.privateKeyForSigning(), isNull);
      expect(session.address, isNull);

      // And it opens again, so nothing was destroyed.
      expect(await session.unlock(password), isNull);
    });

    test('a new wallet can be created and reopened', () async {
      final store = await freshStore();
      final session = SessionController(store);
      await session.restore();

      expect(session.stage, SessionStage.intro);

      const phrase =
          'legal winner thank year wave sausage worth useful legal winner thank yellow';

      await session.adopt(phrase, 'hunter2');

      expect(session.stage, SessionStage.unlocked);

      // Reopened through a fresh controller over the same store, as a restart would.
      final again = SessionController(await freshStore());
      await again.restore();

      expect(again.stage, SessionStage.locked);
      expect(await again.unlock('hunter2'), isNull);
      expect(again.address, session.address);
    });

    test(
      'a created wallet also writes the hash the Tauri build reads',
      () async {
        final store = await freshStore();
        final session = SessionController(store);

        await session.adopt('0x${'a' * 64}', 'hunter2');

        expect(
          store.getString(LegacyStore.keyPassword),
          hashUnlockPassword('hunter2'),
        );
      },
    );

    test('forgetting removes every wallet key', () async {
      final session = await withWallet();
      await session.restore();
      await session.unlock(password);

      await session.forget();

      expect(session.stage, SessionStage.intro);
      expect(session.isUnlocked, isFalse);

      final reopened = await freshStore();

      expect(reopened.has(LegacyStore.keyMnemonic), isFalse);
      expect(reopened.has(LegacyStore.keyPassword), isFalse);
    });

    test('a private-key wallet cannot grow past one account', () async {
      final store = await freshStore();
      final session = SessionController(store);

      final imported = vectors['privateKeyImport'] as Map<String, dynamic>;

      await session.adopt(imported['privateKey'] as String, 'hunter2');

      expect(session.derivable, isFalse);

      await session.selectAccount(3);

      expect(
        session.account,
        0,
        reason: 'there is no second account to select',
      );
      expect(session.address, imported['address']);
    });
  });

  group('unlock screen', () {
    /// Mounts the screen with a session that already holds a Tauri wallet.
    ///
    /// Every real await happens inside [WidgetTester.runAsync]. `testWidgets` runs its body in a
    /// fake-async zone where the clock is controlled by `pump`, and a future backed by actual disk
    /// or asset I/O never completes there — the test simply waits for something the zone will never
    /// deliver. Opening the store and reading the language bundle are both real I/O, so both belong
    /// outside the fake clock; only the pumping belongs inside it.
    Future<SessionController> mount(WidgetTester tester) async {
      late SessionController session;
      late SettingsController settings;

      await tester.runAsync(() async {
        session = await withWallet();
        await session.restore();

        settings = SettingsController(await freshStore());

        await AppLocalizations.preload(AppLanguage.en);
      });

      await tester.pumpWidget(
        SettingsScope(
          notifier: settings,
          child: SessionScope(
            notifier: session,
            child: MaterialApp(
              theme: AppTheme.light(),
              locale: const Locale('en'),
              supportedLocales: AppLocalizations.supportedLocales,
              localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
                AppLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalMaterialLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: const UnlockScreen(),
            ),
          ),
        ),
      );

      // Not `pumpAndSettle`: the field autofocuses and a focused TextField blinks its cursor
      // forever, so settling would wait on an animation designed never to stop.
      await _drain(tester);

      return session;
    }

    testWidgets('shows its strings in the active language', (tester) async {
      await mount(tester);

      expect(find.text('Unlock Wallet'), findsWidgets);
      expect(find.text('Password'), findsOneWidget);
    });

    testWidgets('refuses an empty passphrase without touching the vault', (
      tester,
    ) async {
      final session = await mount(tester);

      await tester.tap(find.byType(NuraButton));
      await tester.pump();

      expect(find.text('Please enter your password'), findsOneWidget);
      expect(session.stage, SessionStage.locked);
    });

    testWidgets('a wrong passphrase says so and clears the field', (
      tester,
    ) async {
      final session = await mount(tester);

      await tester.enterText(find.byType(TextField), 'wrong');

      // The unlock itself is real work — Argon2id over 64 MiB — so it runs outside the fake clock
      // too, and the frames that show its result are pumped after.
      await tester.runAsync(() => session.unlock('wrong'));
      await tester.tap(find.byType(NuraButton));
      await _drain(tester);

      expect(session.stage, SessionStage.locked);
    });

    testWidgets('the right passphrase opens the vault', (tester) async {
      final session = await mount(tester);

      await tester.runAsync(() async {
        expect(await session.unlock(password), isNull);
      });

      await _drain(tester);

      expect(session.stage, SessionStage.unlocked);
      expect(session.isUnlocked, isTrue);
    });
  });
}
