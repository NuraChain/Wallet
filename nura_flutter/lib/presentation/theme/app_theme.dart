import 'package:flutter/material.dart';

import 'tokens.dart';

/// The type scale, straight from the stylesheet's `--text-*` custom properties.
///
/// Five sizes and nothing between them. The Tauri build exposes exactly these through its `Text`
/// component's variants, which is what keeps a caption from drifting into a body size — the same
/// discipline is worth keeping, so widgets ask for a role rather than a number.
@immutable
class NuraTypography extends ThemeExtension<NuraTypography> {
  const NuraTypography({
    required this.tiny,
    required this.small,
    required this.medium,
    required this.large,
    required this.display,
  });

  /// 12px — captions and muted labels.
  final TextStyle tiny;

  /// 14px — body text and button labels.
  final TextStyle small;

  /// 16px — dialog titles.
  final TextStyle medium;

  /// 18px — section headings.
  final TextStyle large;

  /// 30px on a 36px line — the balance figure, and nothing else.
  final TextStyle display;

  static const String fontFamily = 'Vazirmatn';

  /// Builds the scale over a palette.
  ///
  /// Colour is baked in per theme rather than left to inherit, because the two roles the design
  /// separates — `txt-normal` and `txt-muted` — are what the variants actually differ by, and a
  /// style that carries no colour would silently pick up whatever ancestor happened to set one.
  factory NuraTypography.of(NuraColors colors) {
    TextStyle base(double size, FontWeight weight, Color color) => TextStyle(
      fontFamily: fontFamily,
      fontSize: size,
      fontWeight: weight,
      color: color,
      // Persian and Arabic ascenders and descenders need more room than Latin at the same size, and
      // Vazirmatn is drawn for that. 1.5 is what the stylesheet's `line-height: 1.5` gives.
      height: 1.5,
    );

    return NuraTypography(
      tiny: base(12, FontWeight.w400, colors.txtMuted),
      small: base(14, FontWeight.w400, colors.txtNormal),
      medium: base(16, FontWeight.w700, colors.txtNormal),
      large: base(18, FontWeight.w600, colors.txtNormal),
      display: base(
        30,
        FontWeight.w700,
        colors.txtNormal,
      ).copyWith(height: 1.2),
    );
  }

  @override
  NuraTypography copyWith({
    TextStyle? tiny,
    TextStyle? small,
    TextStyle? medium,
    TextStyle? large,
    TextStyle? display,
  }) {
    return NuraTypography(
      tiny: tiny ?? this.tiny,
      small: small ?? this.small,
      medium: medium ?? this.medium,
      large: large ?? this.large,
      display: display ?? this.display,
    );
  }

  @override
  NuraTypography lerp(ThemeExtension<NuraTypography>? other, double t) {
    if (other is! NuraTypography) {
      return this;
    }

    return NuraTypography(
      tiny: TextStyle.lerp(tiny, other.tiny, t)!,
      small: TextStyle.lerp(small, other.small, t)!,
      medium: TextStyle.lerp(medium, other.medium, t)!,
      large: TextStyle.lerp(large, other.large, t)!,
      display: TextStyle.lerp(display, other.display, t)!,
    );
  }
}

/// Spacing, radii and the other repeated dimensions the design uses.
///
/// Named so a widget cannot quietly invent a seventh corner radius. The values are the Tailwind
/// steps the Tauri build settled on, read off the components rather than guessed.
abstract final class NuraMetrics {
  /// Tailwind's 4px scale, at the steps this design actually uses.
  static const double gapTight = 4;
  static const double gapSmall = 8;
  static const double gap = 12;
  static const double gapLarge = 16;

  static const double radiusSmall = 8;
  static const double radiusMedium = 12;
  static const double radiusLarge = 16;
  static const double radiusPanel = 24;

  /// `size-8`, `size-9`, `size-10` — the three icon-button squares.
  static const double iconButton = 32;
  static const double iconChip = 36;
  static const double iconLarge = 40;

  /// `h-11` — the height of an action button and a form field.
  static const double actionHeight = 44;

  /// The width the phone-shaped window opens at, and the cap a dialog uses on a wide screen.
  static const double dialogWidth = 320;

  /// Below this a layout is a phone; above it there is room for a desktop arrangement.
  ///
  /// The Tauri window opens at 360×640 and the design was drawn for that column, so the breakpoint
  /// is about *extra* room rather than about being on a desktop — a resized window on Windows and a
  /// tablet in landscape are the same question.
  static const double wideBreakpoint = 600;
}

/// The application's two themes.
///
/// Material is used as the substrate rather than fought: it supplies focus handling, ink, scrollbars
/// and text selection that would otherwise have to be rebuilt. What it does not supply is this
/// palette, which is why the colours live in [NuraColors] and the Material [ColorScheme] is derived
/// from them rather than the other way round.
abstract final class AppTheme {
  static ThemeData light() => _build(NuraColors.light, Brightness.light);

  static ThemeData dark() => _build(NuraColors.dark, Brightness.dark);

  static ThemeData _build(NuraColors colors, Brightness brightness) {
    final typography = NuraTypography.of(colors);

    final scheme = ColorScheme(
      brightness: brightness,
      primary: colors.btnPrimary,
      onPrimary: colors.txtReverse,
      secondary: colors.btnSecondary,
      onSecondary: colors.txtReverse,
      error: colors.txtError,
      onError: colors.txtReverse,
      surface: colors.baseBg,
      onSurface: colors.txtNormal,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: colors.baseBg,
      fontFamily: NuraTypography.fontFamily,

      // The design paints its own surfaces, so Material's elevation tints would sit underneath them
      // as a second, unasked-for colour.
      canvasColor: colors.baseBg,
      splashFactory: InkRipple.splashFactory,

      textTheme: TextTheme(
        bodySmall: typography.tiny,
        bodyMedium: typography.small,
        titleMedium: typography.medium,
        titleLarge: typography.large,
        displaySmall: typography.display,
      ),

      textSelectionTheme: TextSelectionThemeData(
        cursorColor: colors.btnPrimary,
        selectionColor: colors.btnPrimary.withValues(alpha: 0.3),
        selectionHandleColor: colors.btnPrimary,
      ),

      extensions: <ThemeExtension<dynamic>>[colors, typography],
    );
  }
}

/// `context.colors`, `context.type` and `context.isWide` — the three things widgets reach for.
extension NuraThemeContext on BuildContext {
  NuraColors get colors => NuraColors.of(this);

  NuraTypography get type {
    final typography = Theme.of(this).extension<NuraTypography>();

    assert(typography != null, 'NuraTypography is missing from the ThemeData');

    return typography!;
  }

  /// Whether there is room for a wider arrangement than the phone column.
  ///
  /// Read from the layout, never from the platform. A Windows window dragged narrow should lay out
  /// like a phone, and an Android tablet in landscape should not.
  bool get isWide =>
      MediaQuery.sizeOf(this).width >= NuraMetrics.wideBreakpoint;
}
