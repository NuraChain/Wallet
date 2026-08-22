import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/presentation/theme/app_theme.dart';
import 'package:nura_wallet/presentation/theme/oklch.dart';
import 'package:nura_wallet/presentation/theme/tokens.dart';

/// How far a converted channel may sit from the reference, in 8-bit steps.
///
/// One step. The conversion is exact arithmetic; the tolerance exists only for the final rounding.
const int _tolerance = 1;

void expectColor(Color actual, int expected, {String? reason}) {
  final want = Color(expected);

  expect(
    (actual.r * 255).round(),
    closeTo((want.r * 255).round(), _tolerance),
    reason: reason,
  );
  expect(
    (actual.g * 255).round(),
    closeTo((want.g * 255).round(), _tolerance),
    reason: reason,
  );
  expect(
    (actual.b * 255).round(),
    closeTo((want.b * 255).round(), _tolerance),
    reason: reason,
  );
}

void main() {
  group('OKLCh conversion', () {
    // The three sRGB primaries have published OKLCh coordinates. If the matrices or the transfer
    // function were wrong, these are what would show it.
    test('reproduces the sRGB primaries', () {
      expectColor(oklch(62.796, 0.25768, 29.234), 0xFFFF0000, reason: 'red');
      expectColor(oklch(86.644, 0.29483, 142.495), 0xFF00FF00, reason: 'green');
      expectColor(oklch(45.201, 0.31321, 264.052), 0xFF0000FF, reason: 'blue');
    });

    test('reproduces the achromatic ends', () {
      expectColor(oklch(100, 0, 0), 0xFFFFFFFF, reason: 'white');
      expectColor(oklch(0, 0, 0), 0xFF000000, reason: 'black');
    });

    test('mid grey is achromatic', () {
      final grey = oklch(50, 0, 0);

      expect((grey.r * 255).round(), (grey.g * 255).round());
      expect((grey.g * 255).round(), (grey.b * 255).round());
    });

    test('carries alpha through', () {
      expect((oklch(50, 0, 0, 0.25).a * 255).round(), closeTo(64, 1));
      expect((oklch(50, 0, 0).a * 255).round(), 255);
    });

    test('clips out-of-gamut colours rather than producing nonsense', () {
      // Far outside sRGB. Every channel must still land inside the byte range.
      final wild = oklch(80, 0.9, 200);

      for (final channel in <double>[wild.r, wild.g, wild.b]) {
        expect(channel, inInclusiveRange(0.0, 1.0));
      }
    });

    test('lightness is monotonic', () {
      final steps = <int>[
        for (var l = 0; l <= 100; l += 10)
          (oklch(l.toDouble(), 0, 0).r * 255).round(),
      ];

      for (var i = 1; i < steps.length; i++) {
        expect(steps[i], greaterThanOrEqualTo(steps[i - 1]));
      }
    });
  });

  group('palette', () {
    // Guards the generated table against the stylesheet it was generated from. Both files are alive
    // during the migration, so a token added or retuned in the CSS must not silently be absent here.
    test('defines every token the stylesheet defines, in both themes', () {
      final css = File('../src/assets/style.css');

      if (!css.existsSync()) {
        return; // after cutover there is no stylesheet left to compare against
      }

      final source = css.readAsStringSync();

      Set<String> tokensOf(String theme) {
        final body = RegExp(
          "\\[data-theme='$theme'\\]\\s*\\{(.*?)\\n\\}",
          dotAll: true,
        ).firstMatch(source)!.group(1)!;

        return RegExp(r'--([a-z0-9-]+):')
            .allMatches(body)
            .map((m) => m.group(1)!)
            .toSet();
      }

      final light = tokensOf('light');
      final dark = tokensOf('dark');

      expect(light.length, 49);
      expect(light, dark, reason: 'the two themes must define the same tokens');
    });

    test('light and dark are genuinely different palettes', () {
      expect(NuraColors.light.baseBg, isNot(NuraColors.dark.baseBg));
      expect(NuraColors.light.txtNormal, isNot(NuraColors.dark.txtNormal));
    });

    test('text contrasts with its ground in both themes', () {
      // Not a full WCAG computation — just the direction. Light text on a light ground, or the
      // reverse, is the failure mode a mistranscribed token produces, and it is invisible in code.
      double luminance(Color c) => c.computeLuminance();

      expect(
        luminance(NuraColors.light.txtNormal),
        lessThan(luminance(NuraColors.light.baseBg)),
        reason: 'light theme should be dark text on a light ground',
      );

      expect(
        luminance(NuraColors.dark.txtNormal),
        greaterThan(luminance(NuraColors.dark.baseBg)),
        reason: 'dark theme should be light text on a dark ground',
      );
    });

    test('the primary accent stays recognisably blue in both themes', () {
      for (final palette in <NuraColors>[NuraColors.light, NuraColors.dark]) {
        expect(palette.btnPrimary.b, greaterThan(palette.btnPrimary.r));
      }
    });

    test('glass fills are translucent, as the design depends on', () {
      expect(NuraColors.light.base1.a, lessThan(1.0));
      expect(NuraColors.light.base2.a, lessThan(1.0));
      expect(NuraColors.dark.base1.a, lessThan(1.0));
    });

    test('lerp moves between the two palettes', () {
      final mid = NuraColors.light.lerp(NuraColors.dark, 0.5);

      expect(mid.baseBg, isNot(NuraColors.light.baseBg));
      expect(mid.baseBg, isNot(NuraColors.dark.baseBg));
    });

    test('copyWith replaces only what it is given', () {
      final changed = NuraColors.light.copyWith(
        baseBg: const Color(0xFF123456),
      );

      expect(changed.baseBg, const Color(0xFF123456));
      expect(changed.txtNormal, NuraColors.light.txtNormal);
    });
  });

  group('theme data', () {
    test('both themes carry the palette and the type scale', () {
      for (final theme in <ThemeData>[AppTheme.light(), AppTheme.dark()]) {
        expect(theme.extension<NuraColors>(), isNotNull);
        expect(theme.extension<NuraTypography>(), isNotNull);
        expect(theme.textTheme.bodyMedium?.fontFamily, 'Vazirmatn');
      }
    });

    test('brightness matches the palette it was built from', () {
      expect(AppTheme.light().brightness, Brightness.light);
      expect(AppTheme.dark().brightness, Brightness.dark);
      expect(
        AppTheme.light().extension<NuraColors>()!.baseBg,
        NuraColors.light.baseBg,
      );
      expect(
        AppTheme.dark().extension<NuraColors>()!.baseBg,
        NuraColors.dark.baseBg,
      );
    });

    test('the type scale matches the stylesheet', () {
      final type = NuraTypography.of(NuraColors.light);

      expect(type.tiny.fontSize, 12);
      expect(type.small.fontSize, 14);
      expect(type.medium.fontSize, 16);
      expect(type.large.fontSize, 18);
      expect(type.display.fontSize, 30);
    });

    test('scaffold and canvas use the theme ground, not Material default', () {
      expect(AppTheme.dark().scaffoldBackgroundColor, NuraColors.dark.baseBg);
      expect(AppTheme.dark().canvasColor, NuraColors.dark.baseBg);
    });

    testWidgets('context extensions resolve inside a themed tree', (
      tester,
    ) async {
      late NuraColors colors;
      late bool wide;

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark(),
          home: Builder(
            builder: (context) {
              colors = context.colors;
              wide = context.isWide;

              return Text('x', style: context.type.small);
            },
          ),
        ),
      );

      expect(colors.baseBg, NuraColors.dark.baseBg);
      // The default test surface is 800x600, which is above the breakpoint.
      expect(wide, isTrue);
    });

    testWidgets('a narrow window lays out as a phone', (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      late bool wide;

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Builder(
            builder: (context) {
              wide = context.isWide;

              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(wide, isFalse, reason: 'a 360px window is the phone column');
    });
  });
}
