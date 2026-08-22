/// The ten languages the wallet ships, in the order the picker shows them.
///
/// English and Persian lead because they are the two the app shipped with — the order is a product
/// decision carried over from `languageRecord` in the Tauri build, not an alphabetical accident.
enum AppLanguage {
  en('en', 'us', '🇺🇸'),
  fa('fa', 'ir', '🇮🇷'),
  ar('ar', 'sa', '🇸🇦'),
  es('es', 'es', '🇪🇸'),
  pt('pt', 'br', '🇧🇷'),
  hi('hi', 'in', '🇮🇳'),
  zh('zh', 'cn', '🇨🇳'),
  ru('ru', 'ru', '🇷🇺'),
  fr('fr', 'fr', '🇫🇷'),
  tr('tr', 'tr', '🇹🇷');

  const AppLanguage(this.code, this.country, this.emoji);

  /// The language code, and the name of its bundle under `assets/lang/`.
  final String code;

  /// The flag shown beside it.
  ///
  /// A flag names a country and a language does not, so two of these are a judgement rather than a
  /// fact: Arabic flies Saudi Arabia's as the usual stand-in for Modern Standard Arabic, and
  /// Portuguese flies Brazil's because that is where most of its speakers are. Both choices come
  /// from the Tauri build and are kept so the picker looks the same.
  final String country;
  final String emoji;

  /// Whether this language is written right to left.
  bool get isRtl => this == AppLanguage.fa || this == AppLanguage.ar;

  /// Resolves a stored or system code, falling back to English.
  ///
  /// Unknown input never throws. A corrupt stored preference, or a system locale the wallet has no
  /// bundle for, should open the app in English rather than fail to open it.
  static AppLanguage resolve(String? code) {
    if (code == null) {
      return AppLanguage.en;
    }

    // Matches on the language subtag alone, so `fa-IR` and `pt-BR` resolve rather than falling back.
    final subtag = code.split(RegExp('[-_]')).first.toLowerCase();

    for (final language in AppLanguage.values) {
      if (language.code == subtag) {
        return language;
      }
    }

    return AppLanguage.en;
  }
}

/// One language's strings, and the lookup the whole UI goes through.
///
/// The bundles are the Tauri app's own JSON files, loaded unchanged rather than converted to ARB.
/// That is a deliberate choice and worth stating, because ARB is the idiomatic Flutter answer:
///
/// * There are 2,790 strings across ten languages. Converting them is a mechanical transformation
///   with 2,790 chances to drop, reorder or mangle one, and no test that would notice.
/// * Both applications are alive during the migration. Sharing one source of truth means a
///   translation fixed in one cannot be stale in the other, and `translations_test.dart` enforces
///   that by comparing the copies against `src/assets/lang` directly.
/// * ARB placeholders are named (`{amount}`); these templates are positional (`%s`). Converting
///   would mean re-deriving a name for every placeholder in every string.
///
/// What matters is that lookup goes through a proper [Localizations] delegate rather than a global,
/// which is what makes it rebuild on a language change and testable per widget.
class Translations {
  const Translations(this.language, this._values);

  final AppLanguage language;

  /// Flattened at load: `Dashboard.Send.Title` is one key, not three nested maps walked per lookup.
  final Map<String, String> _values;

  /// Builds a bundle from the parsed JSON tree.
  factory Translations.fromJson(
    AppLanguage language,
    Map<String, dynamic> json,
  ) {
    final flat = <String, String>{};

    void walk(String prefix, Map<String, dynamic> node) {
      for (final entry in node.entries) {
        final key = prefix.isEmpty ? entry.key : '$prefix.${entry.key}';
        final value = entry.value;

        if (value is Map<String, dynamic>) {
          walk(key, value);
        } else if (value is String) {
          flat[key] = value;
        }
      }
    }

    walk('', json);

    return Translations(language, flat);
  }

  /// Every key this bundle holds. Used by the parity test, not by the UI.
  Iterable<String> get keys => _values.keys;

  /// Looks up a dotted key and fills its `%s` placeholders in order.
  ///
  /// Two details are carried over from `T()` in the Tauri build because both are load-bearing:
  ///
  /// * A missing key renders as `[Dotted.Key]` rather than as an empty string. A gap in a
  ///   translation should look like a gap — an empty string looks like a finished design.
  /// * Substitution is a single left-to-right pass whose output is never re-scanned. Arguments are
  ///   user data: a custom network's ticker reaches this function, and a ticker containing `%s`
  ///   would otherwise consume the next argument, while one containing `$&` would splice the
  ///   matched placeholder back into its own translation. Building the result in one pass makes a
  ///   value only ever a value.
  ///
  /// Surplus placeholders are left visible for the same reason a missing key is.
  String call(String name, [List<Object?> args = const []]) {
    final template = _values[name] ?? '[$name]';

    if (!template.contains('%s')) {
      return template;
    }

    final out = StringBuffer();

    var cursor = 0;
    var index = 0;

    while (true) {
      final at = template.indexOf('%s', cursor);

      if (at < 0) {
        out.write(template.substring(cursor));
        break;
      }

      out.write(template.substring(cursor, at));

      // Written straight to the buffer, so nothing an argument contains is ever looked at again.
      out.write(index < args.length ? '${args[index]}' : '%s');

      index += 1;
      cursor = at + 2;
    }

    return out.toString();
  }
}
