import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/core/build_info.dart';

void main() {
  test('the version the settings panel shows is the one pubspec ships', () {
    final line = File('pubspec.yaml')
        .readAsLinesSync()
        .firstWhere((line) => line.startsWith('version:'));

    // `1.0.0+1` — the build number after `+` is Android's versionCode and iOS's CFBundleVersion,
    // neither of which belongs in a version a user reads out.
    final shipped = line.split(':').last.trim().split('+').first;

    expect(
      BuildInfo.version,
      shipped,
      reason:
          'BuildInfo.version has drifted from pubspec.yaml — the settings panel '
          'would name a different release than the one built',
    );
  });
}
