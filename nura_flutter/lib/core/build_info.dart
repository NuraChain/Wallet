/// What this build calls itself.
///
/// A constant rather than a runtime lookup through `package_info_plus`. The version is the one thing
/// the settings panel shows that has no user in it — it is read out loud when reporting a problem —
/// and reaching a platform channel to fetch a string that is fixed at compile time would make the
/// last line of a dialog asynchronous for nothing.
///
/// The cost of a constant is that it can drift from `pubspec.yaml`, which is the number the built
/// artifact actually carries. `build_info_test.dart` asserts the two agree, so the drift fails the
/// suite rather than shipping a dialog that names the wrong release. That is the same arrangement
/// the translation bundles use against the Tauri app's own files.
abstract final class BuildInfo {
  /// Matches the `version:` field in `pubspec.yaml`, without the build number after `+`.
  static const String version = '1.0.0';
}
