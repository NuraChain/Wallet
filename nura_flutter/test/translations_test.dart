import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/core/l10n/app_localizations.dart';
import 'package:nura_wallet/core/l10n/translations.dart';

Translations _load(AppLanguage language) {
  final json = jsonDecode(
    File('assets/lang/${language.code}.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  return Translations.fromJson(language, json);
}

void main() {
  group('bundles', () {
    test('all ten languages load and are non-empty', () {
      expect(AppLanguage.values.length, 10);

      for (final language in AppLanguage.values) {
        expect(_load(language).keys, isNotEmpty, reason: language.code);
      }
    });

    // The migration's drift guard. Both applications are alive, so the copied assets must stay
    // identical to the Tauri app's own files until cutover — a translation fixed in one and not the
    // other is exactly the kind of divergence nobody notices until a user reports it.
    test('copies still match the Tauri source of truth', () {
      for (final language in AppLanguage.values) {
        final mine = File('assets/lang/${language.code}.json');
        final theirs = File('../src/assets/lang/${language.code}.json');

        if (!theirs.existsSync()) {
          // After cutover the Tauri source is gone and there is nothing left to drift from.
          continue;
        }

        expect(
          mine.readAsStringSync(),
          theirs.readAsStringSync(),
          reason: '${language.code}.json has drifted from src/assets/lang',
        );
      }
    });

    test('every language defines every key English defines', () {
      final english = _load(AppLanguage.en).keys.toSet();

      expect(english.length, 279);

      for (final language in AppLanguage.values) {
        final missing = english.difference(_load(language).keys.toSet());

        expect(
          missing,
          isEmpty,
          reason: '${language.code} is missing ${missing.length} key(s)',
        );
      }
    });

    test('no language defines keys English does not', () {
      final english = _load(AppLanguage.en).keys.toSet();

      for (final language in AppLanguage.values) {
        final extra = _load(language).keys.toSet().difference(english);

        expect(extra, isEmpty, reason: '${language.code} has orphan keys');
      }
    });

    test('placeholder counts agree across languages', () {
      // A translation with the wrong number of %s silently drops a value or prints a stray literal.
      final english = _load(AppLanguage.en);

      for (final language in AppLanguage.values) {
        final other = _load(language);

        for (final key in english.keys) {
          expect(
            '%s'.allMatches(other(key)).length,
            '%s'.allMatches(english(key)).length,
            reason: '$key differs in placeholder count for ${language.code}',
          );
        }
      }
    });

    test('nested keys flatten to the dotted form the app uses', () {
      final english = _load(AppLanguage.en);

      expect(english('Dashboard.Send.Title'), 'Send');
      expect(english('Dashboard.Browser.Title'), 'Browser');
      expect(english('Dashboard.Request.Approve'), 'Approve');
    });
  });

  group('substitution', () {
    final english = _load(AppLanguage.en);

    test('fills placeholders in order', () {
      expect(
        english('Dashboard.Browser.CacheSize', ['12', '3 KB']),
        '12 icons, 3 KB',
      );
    });

    test('a missing key renders visibly rather than as nothing', () {
      expect(english('No.Such.Key'), '[No.Such.Key]');
    });

    test('surplus placeholders stay visible', () {
      expect(english('Dashboard.Browser.CacheSize', ['12']), '12 icons, %s');
    });

    // The two cases the Tauri implementation documents at length, because arguments are user data:
    // a custom network's ticker is typed by the user and reaches this function.
    test('a value containing %s does not consume the next argument', () {
      expect(
        english('Dashboard.Browser.CacheSize', ['A%sB', 'second']),
        'A%sB icons, second',
      );
    });

    test('a value containing \$& is written literally', () {
      expect(
        english('Dashboard.Browser.CacheSize', [r'$&', r'$`']),
        r'$& icons, $`',
      );
    });

    test('non-string arguments are accepted', () {
      expect(english('Dashboard.Request.DataSize', [128]), '128 bytes');
    });

    test('a template with no placeholder ignores arguments', () {
      expect(english('Dashboard.Request.Approve', ['unused']), 'Approve');
    });
  });

  group('language resolution', () {
    test('resolves plain and regional codes', () {
      expect(AppLanguage.resolve('fa'), AppLanguage.fa);
      expect(AppLanguage.resolve('fa-IR'), AppLanguage.fa);
      expect(AppLanguage.resolve('pt_BR'), AppLanguage.pt);
      expect(AppLanguage.resolve('ZH'), AppLanguage.zh);
    });

    test('falls back to English rather than failing', () {
      expect(AppLanguage.resolve(null), AppLanguage.en);
      expect(AppLanguage.resolve(''), AppLanguage.en);
      expect(AppLanguage.resolve('kl'), AppLanguage.en);
      expect(AppLanguage.resolve('garbage stored value'), AppLanguage.en);
    });

    test('exactly Persian and Arabic are right to left', () {
      final rtl = AppLanguage.values.where((l) => l.isRtl).toSet();

      expect(rtl, <AppLanguage>{AppLanguage.fa, AppLanguage.ar});
    });
  });

  group('delegate', () {
    /// Mounts one screen under the delegates the real app installs.
    ///
    /// `GlobalWidgetsLocalizations` is the one that matters here: it is what reports a locale's
    /// direction, so the ambient [Directionality] follows the language rather than being set by
    /// hand at each screen. Asserting on the ambient value is therefore the meaningful test — it is
    /// what every widget in the tree will actually lay out against.
    Future<void> pump(WidgetTester tester, Locale locale) async {
      // Unmount first. `testWidgets` shares one binding across the file, so pumping a new app over
      // an old one updates the existing element tree rather than replacing it — and a Localizations
      // whose delegate resolves asynchronously can then be read before the new bundle has landed.
      // Tearing down explicitly makes each pump a cold start, which is what these tests mean to be.
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();

      await tester.pumpWidget(
        WidgetsApp(
          key: ValueKey(locale.languageCode),
          locale: locale,
          color: const Color(0xFF000000),
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, _) => Text(context.t('Dashboard.Request.Approve')),
        ),
      );

      await tester.pumpAndSettle();
    }

    testWidgets('serves English left to right', (tester) async {
      await pump(tester, const Locale('en'));

      expect(find.text('Approve'), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.text('Approve'))),
        TextDirection.ltr,
      );
    });

    testWidgets('serves Persian right to left', (tester) async {
      await pump(tester, const Locale('fa'));

      expect(find.text('تأیید'), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.text('تأیید'))),
        TextDirection.rtl,
      );
    });

    testWidgets('serves Arabic right to left', (tester) async {
      await pump(tester, const Locale('ar'));

      expect(find.text('موافقة'), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.text('موافقة'))),
        TextDirection.rtl,
      );
    });

    testWidgets('every shipped locale resolves and renders', (tester) async {
      for (final language in AppLanguage.values) {
        await pump(tester, Locale(language.code));

        expect(
          AppLocalizations.delegate.isSupported(Locale(language.code)),
          isTrue,
          reason: language.code,
        );

        // Asserted against the string this language actually defines, so the test proves the right
        // bundle was served rather than merely that some text rendered.
        final expected = _load(language)('Dashboard.Request.Approve');
        final found = find.text(expected);

        expect(found, findsOneWidget, reason: language.code);

        expect(
          Directionality.of(tester.element(found)),
          language.isRtl ? TextDirection.rtl : TextDirection.ltr,
          reason: language.code,
        );
      }
    });

    // Regression: the delegate used to answer every load asynchronously, so `Localizations` cleared
    // the subtree and the entire screen went blank for a frame on each language change. Switching
    // back to an already-loaded language must resolve within the same build.
    testWidgets('switching to a loaded language never blanks the screen', (
      tester,
    ) async {
      await pump(tester, const Locale('en'));
      await pump(tester, const Locale('fa'));

      // Back to English, and read the tree *without* settling — one frame only.
      await tester.pumpWidget(
        WidgetsApp(
          locale: const Locale('en'),
          color: const Color(0xFF000000),
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, _) => Text(context.t('Dashboard.Request.Approve')),
        ),
      );
      await tester.pump();

      expect(find.text('Approve'), findsOneWidget);
    });

    testWidgets('an unsupported locale falls back to English', (tester) async {
      await pump(tester, const Locale('kl'));

      expect(find.text('Approve'), findsOneWidget);
    });
  });
}
