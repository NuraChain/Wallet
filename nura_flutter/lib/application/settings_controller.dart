import 'package:flutter/material.dart';

import '../core/l10n/translations.dart';
import '../data/storage/app_store.dart';
import '../data/storage/legacy_store.dart';

/// Which palette the app paints in.
///
/// `system` is the state the Tauri build had but could not name: it stored only `light` or `dark`
/// and, when the key was absent, read the OS preference once at startup. That meant a user who never
/// touched the setting followed the system until the first time they did, and then stopped. Naming
/// the third state fixes it without changing what any stored value means — `light` and `dark` still
/// read back exactly as they did.
enum ThemeChoice {
  system,
  light,
  dark;

  /// The value written to storage, or null for `system` which is stored by absence.
  String? get stored => switch (this) {
    ThemeChoice.system => null,
    ThemeChoice.light => 'light',
    ThemeChoice.dark => 'dark',
  };

  static ThemeChoice resolve(String? stored) => switch (stored) {
    'light' => ThemeChoice.light,
    'dark' => ThemeChoice.dark,
    _ => ThemeChoice.system,
  };

  ThemeMode get mode => switch (this) {
    ThemeChoice.system => ThemeMode.system,
    ThemeChoice.light => ThemeMode.light,
    ThemeChoice.dark => ThemeMode.dark,
  };
}

/// The two preferences that decide how the whole app looks and reads.
///
/// A [ChangeNotifier] rather than a state-management package. The Tauri build's own model was a
/// module singleton with a subscriber list, which is precisely what this is — and Flutter ships it.
/// Adding a dependency to reproduce a pattern the framework already provides would be weight without
/// a reason, and the state here is two fields, not a graph.
class SettingsController extends ChangeNotifier {
  SettingsController(this._store)
    : _language = AppLanguage.resolve(
        _store.getString(LegacyStore.keyLanguage),
      ),
      _theme = ThemeChoice.resolve(_store.getString(LegacyStore.keyTheme));

  final AppStore _store;

  AppLanguage _language;
  ThemeChoice _theme;

  AppLanguage get language => _language;
  ThemeChoice get theme => _theme;

  Locale get locale => Locale(_language.code);

  /// Switches language and remembers it.
  ///
  /// The notification goes out before the write completes. Reversing that would make the interface
  /// wait on a disk write to change a label, and a failed write should cost the preference next
  /// launch rather than the interaction now.
  Future<void> setLanguage(AppLanguage language) async {
    if (_language == language) {
      return;
    }

    _language = language;

    notifyListeners();

    await _store.setString(LegacyStore.keyLanguage, language.code);
  }

  Future<void> setTheme(ThemeChoice choice) async {
    if (_theme == choice) {
      return;
    }

    _theme = choice;

    notifyListeners();

    final stored = choice.stored;

    if (stored == null) {
      await _store.remove(LegacyStore.keyTheme);
    } else {
      await _store.setString(LegacyStore.keyTheme, stored);
    }
  }
}
