import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/application/session_controller.dart';
import 'package:nura_wallet/application/settings_controller.dart';
import 'package:nura_wallet/core/build_info.dart';
import 'package:nura_wallet/core/l10n/app_localizations.dart';
import 'package:nura_wallet/core/l10n/translations.dart';
import 'package:nura_wallet/data/export/phrase_exporter.dart';
import 'package:nura_wallet/data/storage/app_store.dart';
import 'package:nura_wallet/data/storage/legacy_store.dart';
import 'package:nura_wallet/presentation/export/phrase_image.dart';
import 'package:nura_wallet/presentation/screens/logout_sheet.dart';
import 'package:nura_wallet/presentation/screens/phrase_sheet.dart';
import 'package:nura_wallet/presentation/screens/settings_sheet.dart';
import 'package:nura_wallet/presentation/theme/app_theme.dart';

Map<String, dynamic> _vectors() =>
    jsonDecode(File('test/vectors/reference_vectors.json').readAsStringSync())
        as Map<String, dynamic>;

Future<void> _drain(WidgetTester tester, {int frames = 10}) async {
  for (int index = 0; index < frames; index += 1) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// Lets a chain of real file writes actually finish.
///
/// A widget test runs in a fake async zone: a `File` operation starts for real, but the `await`
/// after it only resumes on a pump. A single `runAsync` is not enough for the store's write, which
/// is three operations deep — creating the directory, writing the temporary file, renaming it over
/// the old one. Each needs the platform to do work *and* Dart to pick the result back up, so the
/// two are alternated here rather than done once.
///
/// Without this the session is caught mid-`forget`, with the store already emptied in memory and the
/// stage not yet moved — and the temporary file is still open when `tearDown` tries to delete the
/// directory it is in.
Future<void> _settle(WidgetTester tester, {int turns = 8}) async {
  for (int index = 0; index < turns; index += 1) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );

    await tester.pump();
  }
}

/// An exporter that keeps what it was handed instead of writing it anywhere.
///
/// The point of the real one is to put a recovery phrase into the user's gallery, which is not
/// something a test suite should do to the machine it runs on.
class _Recorder implements PhraseExporter {
  String? text;
  String? textName;
  Uint8List? image;
  String? imageName;

  /// What the next call answers with. Empty is success.
  String failure = '';

  @override
  Future<String> saveImage(Uint8List png, String name) async {
    image = png;
    imageName = name;

    return failure;
  }

  @override
  Future<String> saveText(String body, String name) async {
    text = body;
    textName = name;

    return failure;
  }
}

void main() {
  final vectors = _vectors();

  final phrase =
      (vectors['hdDerivation'] as Map<String, dynamic>)['mnemonic'] as String;

  final words = phrase.split(' ');

  /// The reference mnemonic is the canonical "abandon abandon … about", so only the last word
  /// appears once. Anything asserting a word is or is not on screen has to use that one.
  final unique = words.last;

  const password = 'hunter2';
  const privateKey =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      'aaaaaaaaaaaaaaaa';

  late Directory root;

  Future<AppStore> freshStore() =>
      AppStore.open(directory: root, legacyCandidates: const <File>[]);

  setUp(() async {
    root = await Directory.systemTemp.createTemp('nura-settings');
  });

  tearDown(() async {
    await root.delete(recursive: true);
  });

  /// A store holding a wallet, and the two controllers the settings surface reads.
  Future<
    ({SessionController session, SettingsController settings, AppStore store})
  >
  wallet(WidgetTester tester, {String? secret}) async {
    late SessionController session;
    late SettingsController settings;
    late AppStore store;

    await tester.runAsync(() async {
      store = await freshStore();
      session = SessionController(store);
      settings = SettingsController(store);

      await session.restore();
      await session.adopt(secret ?? phrase, password);

      for (final language in AppLanguage.values) {
        await AppLocalizations.preload(language);
      }
    });

    return (session: session, settings: settings, store: store);
  }

  Future<void> mount(WidgetTester tester, Widget sheet) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
          AppLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Scaffold(body: sheet),
      ),
    );

    await _drain(tester);
  }

  group('SettingsSheet', () {
    testWidgets('names the release it is running', (tester) async {
      final app = await wallet(tester);

      await mount(
        tester,
        SettingsSheet(session: app.session, settings: app.settings),
      );

      expect(find.text('Version ${BuildInfo.version}'), findsOneWidget);
    });

    testWidgets('the theme row reports the palette on screen', (tester) async {
      final app = await wallet(tester);

      await mount(
        tester,
        SettingsSheet(session: app.session, settings: app.settings),
      );

      // `system` on a light device reads as light, rather than as a third label the row has no
      // room for.
      expect(app.settings.theme, ThemeChoice.system);
      expect(find.text('Light'), findsOneWidget);

      await tester.tap(find.text('Theme'));
      await _drain(tester);

      expect(app.settings.theme, ThemeChoice.dark);
      expect(find.text('Dark'), findsOneWidget);
    });

    testWidgets('a phrase wallet and a key wallet name their own secret', (
      tester,
    ) async {
      final withPhrase = await wallet(tester);

      await mount(
        tester,
        SettingsSheet(
          session: withPhrase.session,
          settings: withPhrase.settings,
        ),
      );

      expect(find.text('Recovery Phrase'), findsOneWidget);

      final withKey = await wallet(tester, secret: privateKey);

      await mount(
        tester,
        SettingsSheet(session: withKey.session, settings: withKey.settings),
      );

      expect(find.text('Private Key'), findsOneWidget);
    });
  });

  group('PhraseSheet', () {
    testWidgets('shows nothing until the password is right', (tester) async {
      final app = await wallet(tester);

      await mount(tester, PhraseSheet(session: app.session));

      expect(find.text(unique), findsNothing);

      await tester.enterText(find.byType(TextField), 'not the password');
      await tester.tap(find.text('Show Phrase'));
      await _drain(tester);

      expect(find.text('Wrong password'), findsOneWidget);
      expect(find.text(unique), findsNothing);
    });

    testWidgets('the right password reveals the words, blurred first', (
      tester,
    ) async {
      final app = await wallet(tester);

      await mount(tester, PhraseSheet(session: app.session));

      await tester.enterText(find.byType(TextField), password);
      await tester.tap(find.text('Show Phrase'));
      await _drain(tester);

      // On screen but behind the blur, and the export buttons are not offered yet.
      expect(find.text(unique), findsOneWidget);
      expect(find.byType(ImageFiltered), findsOneWidget);
      expect(find.text('Save as text file'), findsNothing);

      await tester.tap(find.text('Tap to reveal'));
      await _drain(tester);

      expect(find.byType(ImageFiltered), findsNothing);
      expect(find.text('Save as text file'), findsOneWidget);
    });

    testWidgets('exports the phrase as a numbered list', (tester) async {
      final app = await wallet(tester);
      final recorder = _Recorder();

      await mount(
        tester,
        PhraseSheet(session: app.session, exporter: recorder),
      );

      await tester.enterText(find.byType(TextField), password);
      await tester.tap(find.text('Show Phrase'));
      await _drain(tester);

      await tester.tap(find.text('Tap to reveal'));
      await _drain(tester);

      await tester.ensureVisible(find.text('Save as text file'));
      await _drain(tester);

      await tester.tap(find.text('Save as text file'));
      await _drain(tester);

      expect(recorder.text, isNotNull);
      expect(recorder.text!.split('\n').first, '1. ${words.first}');
      expect(recorder.text!.split('\n').last, '${words.length}. ${words.last}');
      expect(recorder.textName, startsWith('nura-recovery-phrase-'));
      expect(recorder.textName, endsWith('.txt'));

      expect(find.textContaining('Saved to Downloads'), findsOneWidget);
    });

    testWidgets('a private key is offered the text file only', (tester) async {
      final app = await wallet(tester, secret: privateKey);
      final recorder = _Recorder();

      await mount(
        tester,
        PhraseSheet(session: app.session, exporter: recorder),
      );

      await tester.enterText(find.byType(TextField), password);
      await tester.tap(find.text('Show Private Key'));
      await _drain(tester);

      await tester.tap(find.text('Tap to reveal'));
      await _drain(tester);

      // A key is one token with nothing to number and no grid to draw.
      expect(find.text('Save as image'), findsNothing);
      expect(find.text('Save as text file'), findsOneWidget);

      await tester.ensureVisible(find.text('Save as text file'));
      await _drain(tester);

      await tester.tap(find.text('Save as text file'));
      await _drain(tester);

      expect(recorder.text, privateKey);
      expect(recorder.textName, startsWith('nura-private-key-'));
    });

    testWidgets('a refused write says so instead of claiming success', (
      tester,
    ) async {
      final app = await wallet(tester);
      final recorder = _Recorder()..failure = PhraseExporter.unsupported;

      await mount(
        tester,
        PhraseSheet(session: app.session, exporter: recorder),
      );

      await tester.enterText(find.byType(TextField), password);
      await tester.tap(find.text('Show Phrase'));
      await _drain(tester);

      await tester.tap(find.text('Tap to reveal'));
      await _drain(tester);

      await tester.ensureVisible(find.text('Save as text file'));
      await _drain(tester);

      await tester.tap(find.text('Save as text file'));
      await _drain(tester);

      expect(find.textContaining('too old'), findsOneWidget);
      expect(find.textContaining('Saved to'), findsNothing);
    });
  });

  group('phraseToPng', () {
    testWidgets('draws a card that is actually a PNG', (tester) async {
      late Uint8List png;

      await tester.runAsync(() async {
        png = await phraseToPng(
          words,
          title: 'Nura Wallet recovery phrase',
          warning: 'Anyone with these words owns the wallet. Keep offline.',
        );
      });

      // The eight-byte signature every PNG opens with. Proves the encoder ran rather than that the
      // drawing looks right, which is not something a test can hold an opinion about.
      expect(png.sublist(0, 8), <int>[
        0x89,
        0x50,
        0x4E,
        0x47,
        0x0D,
        0x0A,
        0x1A,
        0x0A,
      ]);
    });
  });

  group('LogoutSheet', () {
    testWidgets('a wrong password leaves the wallet where it is', (
      tester,
    ) async {
      final app = await wallet(tester);

      await mount(tester, LogoutSheet(session: app.session));

      await tester.enterText(find.byType(TextField), 'not the password');
      await tester.tap(find.text('Log out').last);
      await _drain(tester);

      expect(find.text('Password is incorrect'), findsOneWidget);
      expect(app.store.has(LegacyStore.keyMnemonic), isTrue);
      expect(app.session.stage, SessionStage.unlocked);
    });

    testWidgets('the right password removes the wallet', (tester) async {
      final app = await wallet(tester);

      await mount(tester, LogoutSheet(session: app.session));

      await tester.enterText(find.byType(TextField), password);
      await tester.tap(find.text('Log out').last);

      await _settle(tester);

      expect(app.store.has(LegacyStore.keyMnemonic), isFalse);
      expect(app.session.stage, SessionStage.intro);
    });

    testWidgets('an empty password is refused without touching the vault', (
      tester,
    ) async {
      final app = await wallet(tester);

      await mount(tester, LogoutSheet(session: app.session));

      await tester.tap(find.text('Log out').last);
      await _drain(tester);

      expect(find.text('Please enter your password'), findsOneWidget);
      expect(app.store.has(LegacyStore.keyMnemonic), isTrue);
    });
  });
}
