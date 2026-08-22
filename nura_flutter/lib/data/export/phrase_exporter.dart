import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

/// Writes the recovery phrase out to shared storage, as a picture or a text file.
///
/// This exists because the user asked for it, and it is worth being blunt about what it does: shared
/// storage is exactly that. A picture in the gallery is swept up by whatever photo backup is signed
/// in, and both files are readable by any app the user has granted media or storage access. A phrase
/// that leaves the app's private directory should be treated as public from that moment on — the
/// wallet is only as safe as the least careful place its words end up.
///
/// The app's own encrypted storage is unaffected; nothing here reads or moves it.
///
/// Both calls answer with an empty string on success or a short reason on failure, so the dialog
/// reports the outcome the same way on every platform. [unsupported] is the one reason it renders
/// specially, because it is the one the user can do nothing about.
abstract interface class PhraseExporter {
  /// The reason returned when the platform has no way to write to shared storage at all.
  static const String unsupported = 'unsupported';

  /// The exporter for whichever platform this build is running on.
  ///
  /// Android keeps its own bridge because writing to the gallery goes through MediaStore, which no
  /// Dart file API can reach. Everywhere else `dart:io` does the same job against the user's own
  /// folders, so there is always one of the two.
  factory PhraseExporter.platform() =>
      Platform.isAndroid ? const _AndroidExporter() : const _DesktopExporter();

  Future<String> saveImage(Uint8List png, String name);

  Future<String> saveText(String text, String name);
}

/// Folder the picture lands in, under the platform's own Pictures directory. Matches the Android
/// bridge, so the "saved to Pictures/Nura Wallet" notice is true on both.
const String _pictureFolder = 'Nura Wallet';

/// Turns a thrown value into the short string the dialog reports.
String _reason(Object cause) {
  final message = cause is PlatformException
      ? cause.message ?? ''
      : cause.toString();

  return message.isEmpty ? 'failed' : message;
}

/// The Android export, over a channel into [MediaStore].
///
/// The Kotlin side is a port of the Tauri build's `ExportBridge`, and returns the same short
/// reasons — including [PhraseExporter.unsupported] on a device older than scoped storage, where a
/// write to shared storage needs a runtime grant and the export is refused rather than half-done.
class _AndroidExporter implements PhraseExporter {
  const _AndroidExporter();

  static const MethodChannel _channel = MethodChannel(
    'net.nurachain.nura_wallet/export',
  );

  @override
  Future<String> saveImage(Uint8List png, String name) =>
      _invoke('saveImage', <String, Object?>{'bytes': png, 'name': name});

  @override
  Future<String> saveText(String text, String name) =>
      _invoke('saveText', <String, Object?>{'text': text, 'name': name});

  Future<String> _invoke(String method, Map<String, Object?> arguments) async {
    try {
      return await _channel.invokeMethod<String>(method, arguments) ?? '';
    } on PlatformException catch (cause) {
      return _reason(cause);
    } on MissingPluginException {
      // The channel is registered by the app's own activity, so this only happens on a build where
      // that wiring was dropped. Reporting it as unsupported is honest from the user's side: there
      // is no way to save the file on this build, and nothing they can do about it.
      return PhraseExporter.unsupported;
    }
  }
}

/// The desktop export, straight onto the user's own folders.
///
/// Deliberately writes to the same two places Android does rather than opening a save dialog, so the
/// screen behaves identically on both — the phrase is a backup the user is told to move somewhere
/// offline and delete, and making them choose a folder invites leaving it wherever the dialog
/// happened to open.
class _DesktopExporter implements PhraseExporter {
  const _DesktopExporter();

  @override
  Future<String> saveImage(Uint8List png, String name) async {
    final pictures = _pictures();

    if (pictures == null) {
      return PhraseExporter.unsupported;
    }

    return _write(
      Directory('${pictures.path}${Platform.pathSeparator}$_pictureFolder'),
      name,
      (file) => file.writeAsBytes(png, flush: true),
    );
  }

  @override
  Future<String> saveText(String text, String name) async {
    final downloads = await getDownloadsDirectory();

    if (downloads == null) {
      return PhraseExporter.unsupported;
    }

    return _write(
      downloads,
      name,
      (file) => file.writeAsString(text, flush: true),
    );
  }

  /// The user's Pictures folder.
  ///
  /// `path_provider` has no getter for it on any desktop platform, so it is composed from the home
  /// directory — which is the default location and the one it has on a normal install. A user who
  /// has relocated the folder through Windows' known-folder settings gets the file in the default
  /// place instead of the moved one; the dialog names the path it used, so it is findable either
  /// way.
  Directory? _pictures() {
    final home =
        Platform.environment['USERPROFILE'] ?? Platform.environment['HOME'];

    return home == null || home.isEmpty
        ? null
        : Directory('$home${Platform.pathSeparator}Pictures');
  }

  Future<String> _write(
    Directory folder,
    String name,
    Future<void> Function(File) body,
  ) async {
    try {
      await folder.create(recursive: true);

      await body(File('${folder.path}${Platform.pathSeparator}$name'));

      return '';
    } on FileSystemException catch (cause) {
      return _reason(cause);
    }
  }
}
