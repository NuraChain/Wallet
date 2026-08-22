import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'translations.dart';

/// Makes the active language's strings available to the widget tree.
///
/// A real [LocalizationsDelegate] rather than a global lookup, which buys two things the Tauri
/// build had to arrange by hand: changing language rebuilds everything that reads a string, without
/// any subscription bookkeeping; and a widget test can mount one screen in Persian without touching
/// process-wide state.
class AppLocalizations {
  const AppLocalizations(this.translations);

  final Translations translations;

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// The locales the app declares to the platform.
  static List<Locale> get supportedLocales =>
      AppLanguage.values.map((l) => Locale(l.code)).toList(growable: false);

  /// The nearest bundle in the tree.
  ///
  /// Asserts rather than returning null: a missing delegate is a wiring mistake at the root of the
  /// app, and every screen would fail the same way. Failing loudly at the first lookup says where.
  static AppLocalizations of(BuildContext context) {
    final found = Localizations.of<AppLocalizations>(context, AppLocalizations);

    assert(found != null, 'AppLocalizations.delegate is missing from the app');

    return found!;
  }

  /// The shorthand every widget uses: `context.t('Dashboard.Send.Title')`.
  String call(String key, [List<Object?> args = const []]) =>
      translations(key, args);

  AppLanguage get language => translations.language;

  /// Bundles already parsed, so a language is only ever read off disk once.
  ///
  /// This is what lets [_AppLocalizationsDelegate.load] answer synchronously. `Localizations`
  /// renders **nothing** while a delegate's future is outstanding, so an asynchronous answer means
  /// the whole screen blanks for a frame every time the language changes — and switching language
  /// in the Tauri build was instant. Ten bundles of a few kilobytes each is not a cache worth
  /// evicting from.
  static final Map<AppLanguage, Translations> _bundles =
      <AppLanguage, Translations>{};

  /// The bundle for [language] if it has already been read.
  static Translations? cached(AppLanguage language) => _bundles[language];

  /// Loads one bundle, caching it.
  ///
  /// Bundle failures are not swallowed. A language whose file is missing or malformed is a broken
  /// build, and silently falling back to English would ship it.
  static Future<Translations> load(
    AppLanguage language, {
    AssetBundle? bundle,
  }) async {
    final existing = _bundles[language];

    if (existing != null) {
      return existing;
    }

    final source = await (bundle ?? rootBundle).loadString(
      'assets/lang/${language.code}.json',
    );

    final decoded = jsonDecode(source);

    if (decoded is! Map<String, dynamic>) {
      throw FormatException('the ${language.code} bundle is not a JSON object');
    }

    return _bundles[language] = Translations.fromJson(language, decoded);
  }

  /// Reads a language in before the first frame.
  ///
  /// `main` awaits this for the language the app is about to open in, so the first screen is drawn
  /// with its strings already in hand rather than after a blank frame.
  static Future<void> preload(
    AppLanguage language, {
    AssetBundle? bundle,
  }) async {
    await load(language, bundle: bundle);
  }

  /// Drops the cache. Only tests need this, to prove a cold start still works.
  @visibleForTesting
  static void resetCache() => _bundles.clear();
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLanguage.values.any((l) => l.code == locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) {
    final language = AppLanguage.resolve(locale.languageCode);

    final cached = AppLocalizations.cached(language);

    // Synchronous when the bundle is in hand, which is the case for every language switch after the
    // first. `Localizations` treats a [SynchronousFuture] specially: it takes the value during the
    // same build instead of clearing the subtree and waiting for a later frame. Returning an
    // ordinary already-completed future is not equivalent — it still costs a blank frame.
    if (cached != null) {
      return SynchronousFuture<AppLocalizations>(AppLocalizations(cached));
    }

    return AppLocalizations.load(language).then(AppLocalizations.new);
  }

  // The bundle is immutable and keyed by locale, so Flutter only needs to reload when the locale
  // itself changes — which it handles.
  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

/// `context.t(...)` and `context.language`, so widgets read strings without ceremony.
extension AppLocalizationsContext on BuildContext {
  String t(String key, [List<Object?> args = const []]) =>
      AppLocalizations.of(this)(key, args);

  AppLanguage get language => AppLocalizations.of(this).language;

  /// The direction the active language is written in.
  ///
  /// Read from the language rather than from the ambient [Directionality] so that code deciding
  /// *what* to show — a chevron that should point the other way, a chart that should mirror — asks
  /// the same question the layout does, and gets the same answer.
  TextDirection get direction =>
      language.isRtl ? TextDirection.rtl : TextDirection.ltr;
}
