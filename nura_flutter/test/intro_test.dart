import 'dart:io';

import 'package:bip39/bip39.dart' as bip39;
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/app.dart';
import 'package:nura_wallet/application/session_controller.dart';
import 'package:nura_wallet/application/settings_controller.dart';
import 'package:nura_wallet/core/l10n/app_localizations.dart';
import 'package:nura_wallet/core/l10n/translations.dart';
import 'package:nura_wallet/core/security/password_policy.dart';
import 'package:nura_wallet/data/storage/app_store.dart';
import 'package:nura_wallet/presentation/screens/intro_screen.dart';
import 'package:nura_wallet/presentation/theme/app_theme.dart';

/// Advances a few frames without settling.
///
/// Nothing here may use `pumpAndSettle`: the sheets contain autofocusable fields and busy spinners,
/// both of which animate indefinitely, so a settle would run to its ten-minute timeout.
Future<void> _drain(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  group('password policy', () {
    test('accepts a passphrase inside the bounds', () {
      expect(PasswordPolicy.check('hunter2', 'hunter2'), isNull);
      expect(PasswordPolicy.check('a' * 32, 'a' * 32), isNull);
    });

    test('reports a mismatch before a length problem', () {
      // Both wrong: the mismatch is the useful message, so it must win.
      expect(PasswordPolicy.check('abc', 'xyz'), PasswordIssue.mismatch);
    });

    test('enforces the same bounds the Tauri build enforced', () {
      expect(PasswordPolicy.minimum, 6);
      expect(PasswordPolicy.maximum, 32);
      expect(PasswordPolicy.check('short', 'short'), PasswordIssue.length);
      expect(PasswordPolicy.check('a' * 33, 'a' * 33), PasswordIssue.length);
    });
  });

  group('constant-time compare', () {
    test('agrees with equality', () {
      expect(constantTimeEquals('abc123', 'abc123'), isTrue);
      expect(constantTimeEquals('abc123', 'abc124'), isFalse);
      expect(constantTimeEquals('abc', 'abcd'), isFalse);
      expect(constantTimeEquals('', ''), isTrue);
    });
  });

  group('mnemonic generation', () {
    test('produces a valid twelve-word phrase', () {
      final phrase = bip39.generateMnemonic(strength: 128);

      expect(phrase.split(' ').length, 12);
      expect(bip39.validateMnemonic(phrase), isTrue);
    });

    test('does not repeat', () {
      final seen = <String>{
        for (var i = 0; i < 5; i++) bip39.generateMnemonic(strength: 128),
      };

      expect(seen.length, 5);
    });
  });

  group('intro screen', () {
    late Directory root;

    setUp(() async {
      root = await Directory.systemTemp.createTemp('nura-intro-test');
    });

    tearDown(() async {
      if (root.existsSync()) {
        await root.delete(recursive: true);
      }
    });

    Future<({SettingsController settings, SessionController session})> mount(
      WidgetTester tester, {
      Locale locale = const Locale('en'),
    }) async {
      late SettingsController settings;
      late SessionController session;

      // Real disk and asset work stays outside the fake-async zone, which never completes it.
      await tester.runAsync(() async {
        final store = await AppStore.open(
          directory: root,
          legacyCandidates: const <File>[],
        );

        settings = SettingsController(store);
        session = SessionController(store);

        await session.restore();

        for (final language in AppLanguage.values) {
          await AppLocalizations.preload(language);
        }
      });

      await tester.pumpWidget(
        SettingsScope(
          notifier: settings,
          child: SessionScope(
            notifier: session,
            child: MaterialApp(
              theme: AppTheme.light(),
              darkTheme: AppTheme.dark(),
              locale: locale,
              supportedLocales: AppLocalizations.supportedLocales,
              localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
                AppLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalMaterialLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: const IntroScreen(),
            ),
          ),
        ),
      );

      await _drain(tester);

      return (settings: settings, session: session);
    }

    testWidgets('opens on the first slide with both ways in', (tester) async {
      await mount(tester);

      expect(find.text('Connect to the World'), findsOneWidget);
      expect(find.text('Create New Wallet'), findsOneWidget);
      expect(find.text('Import Existing Wallet'), findsOneWidget);
    });

    testWidgets('renders in Persian, right to left', (tester) async {
      await mount(tester, locale: const Locale('fa'));

      final direction = Directionality.of(
        tester.element(find.byType(IntroScreen)),
      );

      expect(direction, TextDirection.rtl);
      expect(find.text('ایجاد کیف پول'), findsOneWidget);
    });

    testWidgets('the language picker changes the interface language', (
      tester,
    ) async {
      final app = await mount(tester);

      await tester.tap(find.bySemanticsLabel('Select Language'));
      await _drain(tester);

      // The picker lists every shipped language.
      expect(find.text('FA'), findsOneWidget);

      await tester.tap(find.text('FA'));
      await _drain(tester);

      expect(app.settings.language, AppLanguage.fa);
    });

    testWidgets('the create sheet opens and refuses a short passphrase', (
      tester,
    ) async {
      final app = await mount(tester);

      await tester.tap(find.text('Create New Wallet'));
      await _drain(tester);

      // Title appears in the sheet as well as on the button behind it.
      expect(
        find.text('Set up your secure wallet to get started'),
        findsOneWidget,
      );

      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), 'short');
      await tester.enterText(fields.at(1), 'short');

      // Submit stays disabled until the acknowledgement is ticked.
      await tester.tap(find.text('Create Wallet'));
      await _drain(tester);

      expect(app.session.stage, SessionStage.intro);

      await tester.tap(
        find.text('I understand my password cannot be recovered'),
      );
      await _drain(tester);

      await tester.tap(find.text('Create Wallet'));
      await _drain(tester);

      expect(
        find.text('Password must be between 6 and 32 characters'),
        findsOneWidget,
      );
      expect(app.session.stage, SessionStage.intro);
    });

    testWidgets('the create sheet reports a mismatch', (tester) async {
      await mount(tester);

      await tester.tap(find.text('Create New Wallet'));
      await _drain(tester);

      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), 'hunter2');
      await tester.enterText(fields.at(1), 'hunter3');

      await tester.tap(
        find.text('I understand my password cannot be recovered'),
      );
      await _drain(tester);
      await tester.tap(find.text('Create Wallet'));
      await _drain(tester);

      expect(find.text('Passwords do not match'), findsOneWidget);
    });

    testWidgets('the import sheet rejects a bad phrase and a bad key', (
      tester,
    ) async {
      final app = await mount(tester);

      await tester.tap(find.text('Import Existing Wallet'));
      await _drain(tester);

      final fields = find.byType(TextField);

      // Twelve real words with a broken checksum — the case that silently derives a stranger's
      // wallet if a port only counts words.
      await tester.enterText(
        fields.at(0),
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon',
      );
      await tester.enterText(fields.at(1), 'hunter2');
      await tester.enterText(fields.at(2), 'hunter2');

      await tester.tap(
        find.text('I understand my password cannot be recovered'),
      );
      await _drain(tester);
      await tester.tap(find.text('Import Wallet'));
      await _drain(tester);

      expect(find.text('Seed phrase is not valid'), findsOneWidget);
      expect(app.session.stage, SessionStage.intro);

      // Now the private-key tab, with something that is not a key.
      await tester.tap(find.text('Private Key'));
      await _drain(tester);

      await tester.enterText(find.byType(TextField).at(0), '0xdeadbeef');
      await tester.tap(find.text('Import Wallet'));
      await _drain(tester);

      expect(find.text('Private key is not valid'), findsOneWidget);
    });

    testWidgets('switching import method clears what was typed', (
      tester,
    ) async {
      await mount(tester);

      await tester.tap(find.text('Import Existing Wallet'));
      await _drain(tester);

      await tester.enterText(find.byType(TextField).at(0), 'some phrase');

      await tester.tap(find.text('Private Key'));
      await _drain(tester);

      // A phrase left behind would be validated as a key and refused, which reads as the wallet
      // being rejected rather than as the wrong tab being open.
      expect(
        tester.widget<TextField>(find.byType(TextField).at(0)).controller!.text,
        isEmpty,
      );
    });
  });
}
