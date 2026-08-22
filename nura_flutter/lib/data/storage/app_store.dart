import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'legacy_store.dart';

/// The wallet's key–value store, in the same shape and the same format the Tauri build used.
///
/// One flat object of string keys, written as pretty-printed JSON, exactly matching what
/// `tauri-plugin-store` produced. Keeping the format means the migration reader and the writer agree
/// by construction rather than by a conversion nobody would test.
///
/// **Nothing secret is stored in the clear here.** The recovery phrase arrives already encrypted —
/// `VaultCipher` seals it under an Argon2id key before it reaches this class — and the unlock hash
/// is a hash. Everything else is a preference. That was true of the Tauri store and is the property
/// that lets this file sit in ordinary app storage.
class AppStore {
  AppStore._(this._file, this._values);

  final File _file;
  final Map<String, dynamic> _values;

  /// Where the store lives for this build.
  static Future<File> resolveFile() async {
    final directory = await getApplicationSupportDirectory();

    return File(p.join(directory.path, LegacyStore.fileName));
  }

  /// Opens the store, importing a Tauri installation's data the first time it runs.
  ///
  /// The import is one-way and non-destructive: the old file is read and left exactly where it is.
  /// If a user rolls back to the Tauri build their wallet is still there, which is the only safe
  /// direction for a migration that touches the file holding an encrypted recovery phrase.
  ///
  /// [directory] and [legacyCandidates] exist for tests; production resolves both from the platform.
  static Future<AppStore> open({
    Directory? directory,
    List<File>? legacyCandidates,
  }) async {
    final file = directory == null
        ? await resolveFile()
        : File(p.join(directory.path, LegacyStore.fileName));

    if (await file.exists()) {
      return AppStore._(file, _decode(await file.readAsString()));
    }

    for (final candidate in legacyCandidates ?? await legacyLocations()) {
      if (!await candidate.exists()) {
        continue;
      }

      // Parsed rather than copied byte-for-byte, so a file that is not actually a store is not
      // adopted as one — and a malformed one throws here rather than at unlock time.
      final imported = _decode(await candidate.readAsString());

      final store = AppStore._(file, imported);

      await store._write();

      return store;
    }

    return AppStore._(file, <String, dynamic>{});
  }

  /// Where a Tauri installation would have left its store.
  ///
  /// Windows: `dirs::data_dir()/<identifier>`, and the identifier is the platform-specific one from
  /// `tauri.windows.conf.json` rather than the base config's.
  ///
  /// Android: Tauri resolves `AppData` to the Context's *data* directory, while Flutter's support
  /// directory is `files/` inside it — so the legacy file sits one level up. Both are inside the
  /// same package sandbox, which is only true because the Flutter build kept the Tauri
  /// `applicationId`.
  static Future<List<File>> legacyLocations() async {
    final support = await getApplicationSupportDirectory();

    if (Platform.isAndroid) {
      return <File>[
        File(p.join(p.dirname(support.path), LegacyStore.fileName)),
        File(p.join(support.path, LegacyStore.fileName)),
      ];
    }

    if (Platform.isWindows) {
      final appData = Platform.environment['APPDATA'];

      return <File>[
        if (appData != null)
          File(p.join(appData, 'io.nurawallet.windows', LegacyStore.fileName)),
        if (appData != null)
          File(p.join(appData, 'io.nurawallet', LegacyStore.fileName)),
      ];
    }

    return <File>[];
  }

  static Map<String, dynamic> _decode(String contents) {
    final decoded = jsonDecode(contents);

    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('store root is not a JSON object');
    }

    return decoded;
  }

  /// Every key currently held, for the settings screens that count them.
  Iterable<String> get keys => _values.keys;

  /// A stored value, or null when absent.
  ///
  /// Non-string values read as absent. Everything this app writes goes through [setString], so a
  /// value of another type means the file was edited by something else.
  String? getString(String key) {
    final value = _values[key];

    return value is String ? value : null;
  }

  bool has(String key) => getString(key) != null;

  Future<void> setString(String key, String value) async {
    _values[key] = value;

    await _write();
  }

  Future<void> remove(String key) async {
    _values.remove(key);

    await _write();
  }

  /// Removes several keys with a single write.
  ///
  /// Logging out clears five of them. One write at the end means the file either still holds the
  /// wallet or holds none of it — never half, which is a state nothing downstream could interpret.
  Future<void> removeAll(Iterable<String> keys) async {
    for (final key in keys) {
      _values.remove(key);
    }

    await _write();
  }

  /// Writes the file, atomically where the platform allows it.
  ///
  /// A crash partway through overwriting this file would leave a truncated store — and the value it
  /// holds is the only copy of the encrypted recovery phrase on the device. Writing beside it and
  /// renaming makes the replacement a single filesystem operation, so the file on disk is always
  /// either the whole old store or the whole new one.
  Future<void> _write() async {
    await _file.parent.create(recursive: true);

    final temporary = File('${_file.path}.tmp');

    await temporary.writeAsString(
      const JsonEncoder.withIndent('  ').convert(_values),
      flush: true,
    );

    await temporary.rename(_file.path);
  }
}
