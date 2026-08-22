import 'package:flutter/material.dart';

import 'oklch.dart';

/// Every colour the wallet uses, in both themes.
///
/// A [ThemeExtension] rather than shoehorning the palette into [ColorScheme]: this design has 49
/// named roles — three glass fills, five button families with four states each, separate scrim,
/// badge and orb colours — and Material's scheme has slots for a fraction of them. Forcing the rest
/// into `surfaceVariant` and friends would make every widget read a name that does not describe what
/// it is painting.
///
/// The values are lifted verbatim from `src/assets/style.css` and stay in OKLCh so they can be
/// compared with that file by eye. See [oklch] for why the conversion happens at runtime.
///
/// Generated from the stylesheet rather than transcribed. Both themes define the same 49 tokens, and
/// `theme_test.dart` asserts that still holds against the CSS.
@immutable
class NuraColors extends ThemeExtension<NuraColors> {
  const NuraColors({
    required this.baseBg,
    required this.orb1,
    required this.orb2,
    required this.orb3,
    required this.base1,
    required this.base2,
    required this.base3,
    required this.scrollbarThumb,
    required this.scrollbarThumbHover,
    required this.scrim,
    required this.badge,
    required this.badgeBorder,
    required this.badgeText,
    required this.glassBorder,
    required this.glassHighlight,
    required this.glassShadow,
    required this.btnMuted,
    required this.btnMutedHover,
    required this.btnMutedActive,
    required this.btnMutedBorder,
    required this.btnMutedOutline,
    required this.btnNormal,
    required this.btnNormalHover,
    required this.btnNormalActive,
    required this.btnNormalBorder,
    required this.btnNormalOutline,
    required this.btnPrimary,
    required this.btnPrimaryHover,
    required this.btnPrimaryActive,
    required this.btnPrimaryBorder,
    required this.btnPrimaryOutline,
    required this.btnSecondary,
    required this.btnSecondaryHover,
    required this.btnSecondaryActive,
    required this.btnSecondaryBorder,
    required this.btnSecondaryOutline,
    required this.btnDanger,
    required this.btnDangerHover,
    required this.btnDangerActive,
    required this.btnDangerBorder,
    required this.btnDangerOutline,
    required this.inputBg,
    required this.inputNormal,
    required this.inputPrimary,
    required this.txtMuted,
    required this.txtNormal,
    required this.txtReverse,
    required this.txtError,
    required this.txtSuccess,
  });

  final Color baseBg;
  final Color orb1;
  final Color orb2;
  final Color orb3;
  final Color base1;
  final Color base2;
  final Color base3;
  final Color scrollbarThumb;
  final Color scrollbarThumbHover;
  final Color scrim;
  final Color badge;
  final Color badgeBorder;
  final Color badgeText;
  final Color glassBorder;
  final Color glassHighlight;
  final Color glassShadow;
  final Color btnMuted;
  final Color btnMutedHover;
  final Color btnMutedActive;
  final Color btnMutedBorder;
  final Color btnMutedOutline;
  final Color btnNormal;
  final Color btnNormalHover;
  final Color btnNormalActive;
  final Color btnNormalBorder;
  final Color btnNormalOutline;
  final Color btnPrimary;
  final Color btnPrimaryHover;
  final Color btnPrimaryActive;
  final Color btnPrimaryBorder;
  final Color btnPrimaryOutline;
  final Color btnSecondary;
  final Color btnSecondaryHover;
  final Color btnSecondaryActive;
  final Color btnSecondaryBorder;
  final Color btnSecondaryOutline;
  final Color btnDanger;
  final Color btnDangerHover;
  final Color btnDangerActive;
  final Color btnDangerBorder;
  final Color btnDangerOutline;
  final Color inputBg;
  final Color inputNormal;
  final Color inputPrimary;
  final Color txtMuted;
  final Color txtNormal;
  final Color txtReverse;
  final Color txtError;
  final Color txtSuccess;

  /// The light palette, from `[data-theme='light']`.
  static final NuraColors light = NuraColors(
    baseBg: oklch(96, 0.01, 250),
    orb1: oklch(85, 0.09, 250, 0.8),
    orb2: oklch(87, 0.08, 310, 0.7),
    orb3: oklch(88, 0.07, 200, 0.7),
    base1: oklch(100, 0, 0, 0.25),
    base2: oklch(100, 0, 0, 0.6),
    base3: oklch(100, 0, 0, 0.4),
    scrollbarThumb: oklch(45, 0.02, 260, 0.05),
    scrollbarThumbHover: oklch(45, 0.02, 260, 0.15),
    scrim: oklch(0, 0, 0, 0.25),
    badge: oklch(100, 0, 0),
    badgeBorder: oklch(0, 0, 0, 0.08),
    badgeText: oklch(20, 0.02, 260),
    glassBorder: oklch(100, 0, 0, 0.6),
    glassHighlight: oklch(100, 0, 0, 0.5),
    glassShadow: oklch(30, 0.03, 260, 0.12),
    btnMuted: oklch(100, 0, 0, 0.2),
    btnMutedHover: oklch(100, 0, 0, 0.4),
    btnMutedActive: oklch(96, 0, 0, 0.8),
    btnMutedBorder: oklch(100, 0, 0, 0.2),
    btnMutedOutline: oklch(62, 0.19, 255, 0.85),
    btnNormal: oklch(100, 0, 0, 0.55),
    btnNormalHover: oklch(100, 0, 0, 0.8),
    btnNormalActive: oklch(96, 0, 0, 0.7),
    btnNormalBorder: oklch(100, 0, 0, 0.65),
    btnNormalOutline: oklch(62, 0.19, 255, 0.85),
    btnPrimary: oklch(58, 0.21, 255, 0.9),
    btnPrimaryHover: oklch(63, 0.21, 255, 0.9),
    btnPrimaryActive: oklch(53, 0.21, 255, 0.95),
    btnPrimaryBorder: oklch(70, 0.16, 255, 0.5),
    btnPrimaryOutline: oklch(58, 0.21, 255, 0.6),
    btnSecondary: oklch(60, 0.02, 260, 0.6),
    btnSecondaryHover: oklch(65, 0.02, 260, 0.6),
    btnSecondaryActive: oklch(55, 0.02, 260, 0.7),
    btnSecondaryBorder: oklch(75, 0.02, 260, 0.4),
    btnSecondaryOutline: oklch(60, 0.02, 260, 0.6),
    btnDanger: oklch(55, 0.22, 25, 0.9),
    btnDangerHover: oklch(60, 0.22, 25, 0.9),
    btnDangerActive: oklch(50, 0.22, 25, 0.95),
    btnDangerBorder: oklch(65, 0.18, 25, 0.5),
    btnDangerOutline: oklch(55, 0.22, 25, 0.6),
    inputBg: oklch(100, 0, 0, 0.5),
    inputNormal: oklch(85, 0.01, 260, 0.9),
    inputPrimary: oklch(58, 0.21, 255, 0.9),
    txtMuted: oklch(50, 0.02, 260),
    txtNormal: oklch(20, 0.02, 260),
    txtReverse: oklch(98, 0, 0),
    txtError: oklch(55, 0.22, 25),
    txtSuccess: oklch(52, 0.16, 150),
  );

  /// The dark palette, from `[data-theme='dark']`.
  static final NuraColors dark = NuraColors(
    baseBg: oklch(18, 0.02, 260),
    orb1: oklch(40, 0.12, 260, 0.55),
    orb2: oklch(35, 0.11, 310, 0.5),
    orb3: oklch(38, 0.09, 210, 0.45),
    base1: oklch(25, 0.02, 260, 0.25),
    base2: oklch(28, 0.02, 260, 0.55),
    base3: oklch(30, 0.02, 260, 0.4),
    scrollbarThumb: oklch(100, 0, 0, 0.05),
    scrollbarThumbHover: oklch(100, 0, 0, 0.15),
    scrim: oklch(0, 0, 0, 0.25),
    badge: oklch(100, 0, 0),
    badgeBorder: oklch(0, 0, 0, 0.08),
    badgeText: oklch(20, 0.02, 260),
    glassBorder: oklch(100, 0, 0, 0.14),
    glassHighlight: oklch(100, 0, 0, 0.12),
    glassShadow: oklch(0, 0, 0, 0.45),
    btnMuted: oklch(100, 0, 0, 0.04),
    btnMutedHover: oklch(100, 0, 0, 0.08),
    btnMutedActive: oklch(100, 0, 0, 0.03),
    btnMutedBorder: oklch(100, 0, 0, 0.07),
    btnMutedOutline: oklch(62, 0.19, 255, 0.85),
    btnNormal: oklch(100, 0, 0, 0.08),
    btnNormalHover: oklch(100, 0, 0, 0.16),
    btnNormalActive: oklch(100, 0, 0, 0.06),
    btnNormalBorder: oklch(100, 0, 0, 0.14),
    btnNormalOutline: oklch(62, 0.19, 255, 0.85),
    btnPrimary: oklch(62, 0.19, 255, 0.85),
    btnPrimaryHover: oklch(67, 0.19, 255, 0.85),
    btnPrimaryActive: oklch(57, 0.19, 255, 0.9),
    btnPrimaryBorder: oklch(75, 0.14, 255, 0.35),
    btnPrimaryOutline: oklch(62, 0.19, 255, 0.6),
    btnSecondary: oklch(45, 0.02, 260, 0.5),
    btnSecondaryHover: oklch(50, 0.02, 260, 0.5),
    btnSecondaryActive: oklch(40, 0.02, 260, 0.6),
    btnSecondaryBorder: oklch(100, 0, 0, 0.12),
    btnSecondaryOutline: oklch(60, 0.02, 260, 0.6),
    btnDanger: oklch(62, 0.20, 25, 0.85),
    btnDangerHover: oklch(67, 0.20, 25, 0.85),
    btnDangerActive: oklch(57, 0.20, 25, 0.9),
    btnDangerBorder: oklch(75, 0.15, 25, 0.35),
    btnDangerOutline: oklch(62, 0.20, 25, 0.6),
    inputBg: oklch(100, 0, 0, 0.06),
    inputNormal: oklch(100, 0, 0, 0.16),
    inputPrimary: oklch(62, 0.19, 255, 0.9),
    txtMuted: oklch(72, 0.02, 260),
    txtNormal: oklch(96, 0.005, 260),
    txtReverse: oklch(98, 0, 0),
    txtError: oklch(72, 0.19, 25),
    txtSuccess: oklch(72, 0.16, 150),
  );

  /// The palette in scope. Asserts rather than falling back to a default, because a widget painting
  /// itself in colours the app never chose is a wiring bug that should be loud.
  static NuraColors of(BuildContext context) {
    final colors = Theme.of(context).extension<NuraColors>();

    assert(colors != null, 'NuraColors is missing from the ThemeData');

    return colors!;
  }

  @override
  NuraColors copyWith({
    Color? baseBg,
    Color? orb1,
    Color? orb2,
    Color? orb3,
    Color? base1,
    Color? base2,
    Color? base3,
    Color? scrollbarThumb,
    Color? scrollbarThumbHover,
    Color? scrim,
    Color? badge,
    Color? badgeBorder,
    Color? badgeText,
    Color? glassBorder,
    Color? glassHighlight,
    Color? glassShadow,
    Color? btnMuted,
    Color? btnMutedHover,
    Color? btnMutedActive,
    Color? btnMutedBorder,
    Color? btnMutedOutline,
    Color? btnNormal,
    Color? btnNormalHover,
    Color? btnNormalActive,
    Color? btnNormalBorder,
    Color? btnNormalOutline,
    Color? btnPrimary,
    Color? btnPrimaryHover,
    Color? btnPrimaryActive,
    Color? btnPrimaryBorder,
    Color? btnPrimaryOutline,
    Color? btnSecondary,
    Color? btnSecondaryHover,
    Color? btnSecondaryActive,
    Color? btnSecondaryBorder,
    Color? btnSecondaryOutline,
    Color? btnDanger,
    Color? btnDangerHover,
    Color? btnDangerActive,
    Color? btnDangerBorder,
    Color? btnDangerOutline,
    Color? inputBg,
    Color? inputNormal,
    Color? inputPrimary,
    Color? txtMuted,
    Color? txtNormal,
    Color? txtReverse,
    Color? txtError,
    Color? txtSuccess,
  }) {
    return NuraColors(
      baseBg: baseBg ?? this.baseBg,
      orb1: orb1 ?? this.orb1,
      orb2: orb2 ?? this.orb2,
      orb3: orb3 ?? this.orb3,
      base1: base1 ?? this.base1,
      base2: base2 ?? this.base2,
      base3: base3 ?? this.base3,
      scrollbarThumb: scrollbarThumb ?? this.scrollbarThumb,
      scrollbarThumbHover: scrollbarThumbHover ?? this.scrollbarThumbHover,
      scrim: scrim ?? this.scrim,
      badge: badge ?? this.badge,
      badgeBorder: badgeBorder ?? this.badgeBorder,
      badgeText: badgeText ?? this.badgeText,
      glassBorder: glassBorder ?? this.glassBorder,
      glassHighlight: glassHighlight ?? this.glassHighlight,
      glassShadow: glassShadow ?? this.glassShadow,
      btnMuted: btnMuted ?? this.btnMuted,
      btnMutedHover: btnMutedHover ?? this.btnMutedHover,
      btnMutedActive: btnMutedActive ?? this.btnMutedActive,
      btnMutedBorder: btnMutedBorder ?? this.btnMutedBorder,
      btnMutedOutline: btnMutedOutline ?? this.btnMutedOutline,
      btnNormal: btnNormal ?? this.btnNormal,
      btnNormalHover: btnNormalHover ?? this.btnNormalHover,
      btnNormalActive: btnNormalActive ?? this.btnNormalActive,
      btnNormalBorder: btnNormalBorder ?? this.btnNormalBorder,
      btnNormalOutline: btnNormalOutline ?? this.btnNormalOutline,
      btnPrimary: btnPrimary ?? this.btnPrimary,
      btnPrimaryHover: btnPrimaryHover ?? this.btnPrimaryHover,
      btnPrimaryActive: btnPrimaryActive ?? this.btnPrimaryActive,
      btnPrimaryBorder: btnPrimaryBorder ?? this.btnPrimaryBorder,
      btnPrimaryOutline: btnPrimaryOutline ?? this.btnPrimaryOutline,
      btnSecondary: btnSecondary ?? this.btnSecondary,
      btnSecondaryHover: btnSecondaryHover ?? this.btnSecondaryHover,
      btnSecondaryActive: btnSecondaryActive ?? this.btnSecondaryActive,
      btnSecondaryBorder: btnSecondaryBorder ?? this.btnSecondaryBorder,
      btnSecondaryOutline: btnSecondaryOutline ?? this.btnSecondaryOutline,
      btnDanger: btnDanger ?? this.btnDanger,
      btnDangerHover: btnDangerHover ?? this.btnDangerHover,
      btnDangerActive: btnDangerActive ?? this.btnDangerActive,
      btnDangerBorder: btnDangerBorder ?? this.btnDangerBorder,
      btnDangerOutline: btnDangerOutline ?? this.btnDangerOutline,
      inputBg: inputBg ?? this.inputBg,
      inputNormal: inputNormal ?? this.inputNormal,
      inputPrimary: inputPrimary ?? this.inputPrimary,
      txtMuted: txtMuted ?? this.txtMuted,
      txtNormal: txtNormal ?? this.txtNormal,
      txtReverse: txtReverse ?? this.txtReverse,
      txtError: txtError ?? this.txtError,
      txtSuccess: txtSuccess ?? this.txtSuccess,
    );
  }

  @override
  NuraColors lerp(ThemeExtension<NuraColors>? other, double t) {
    if (other is! NuraColors) {
      return this;
    }

    return NuraColors(
      baseBg: Color.lerp(baseBg, other.baseBg, t)!,
      orb1: Color.lerp(orb1, other.orb1, t)!,
      orb2: Color.lerp(orb2, other.orb2, t)!,
      orb3: Color.lerp(orb3, other.orb3, t)!,
      base1: Color.lerp(base1, other.base1, t)!,
      base2: Color.lerp(base2, other.base2, t)!,
      base3: Color.lerp(base3, other.base3, t)!,
      scrollbarThumb: Color.lerp(scrollbarThumb, other.scrollbarThumb, t)!,
      scrollbarThumbHover: Color.lerp(
        scrollbarThumbHover,
        other.scrollbarThumbHover,
        t,
      )!,
      scrim: Color.lerp(scrim, other.scrim, t)!,
      badge: Color.lerp(badge, other.badge, t)!,
      badgeBorder: Color.lerp(badgeBorder, other.badgeBorder, t)!,
      badgeText: Color.lerp(badgeText, other.badgeText, t)!,
      glassBorder: Color.lerp(glassBorder, other.glassBorder, t)!,
      glassHighlight: Color.lerp(glassHighlight, other.glassHighlight, t)!,
      glassShadow: Color.lerp(glassShadow, other.glassShadow, t)!,
      btnMuted: Color.lerp(btnMuted, other.btnMuted, t)!,
      btnMutedHover: Color.lerp(btnMutedHover, other.btnMutedHover, t)!,
      btnMutedActive: Color.lerp(btnMutedActive, other.btnMutedActive, t)!,
      btnMutedBorder: Color.lerp(btnMutedBorder, other.btnMutedBorder, t)!,
      btnMutedOutline: Color.lerp(btnMutedOutline, other.btnMutedOutline, t)!,
      btnNormal: Color.lerp(btnNormal, other.btnNormal, t)!,
      btnNormalHover: Color.lerp(btnNormalHover, other.btnNormalHover, t)!,
      btnNormalActive: Color.lerp(btnNormalActive, other.btnNormalActive, t)!,
      btnNormalBorder: Color.lerp(btnNormalBorder, other.btnNormalBorder, t)!,
      btnNormalOutline: Color.lerp(
        btnNormalOutline,
        other.btnNormalOutline,
        t,
      )!,
      btnPrimary: Color.lerp(btnPrimary, other.btnPrimary, t)!,
      btnPrimaryHover: Color.lerp(btnPrimaryHover, other.btnPrimaryHover, t)!,
      btnPrimaryActive: Color.lerp(
        btnPrimaryActive,
        other.btnPrimaryActive,
        t,
      )!,
      btnPrimaryBorder: Color.lerp(
        btnPrimaryBorder,
        other.btnPrimaryBorder,
        t,
      )!,
      btnPrimaryOutline: Color.lerp(
        btnPrimaryOutline,
        other.btnPrimaryOutline,
        t,
      )!,
      btnSecondary: Color.lerp(btnSecondary, other.btnSecondary, t)!,
      btnSecondaryHover: Color.lerp(
        btnSecondaryHover,
        other.btnSecondaryHover,
        t,
      )!,
      btnSecondaryActive: Color.lerp(
        btnSecondaryActive,
        other.btnSecondaryActive,
        t,
      )!,
      btnSecondaryBorder: Color.lerp(
        btnSecondaryBorder,
        other.btnSecondaryBorder,
        t,
      )!,
      btnSecondaryOutline: Color.lerp(
        btnSecondaryOutline,
        other.btnSecondaryOutline,
        t,
      )!,
      btnDanger: Color.lerp(btnDanger, other.btnDanger, t)!,
      btnDangerHover: Color.lerp(btnDangerHover, other.btnDangerHover, t)!,
      btnDangerActive: Color.lerp(btnDangerActive, other.btnDangerActive, t)!,
      btnDangerBorder: Color.lerp(btnDangerBorder, other.btnDangerBorder, t)!,
      btnDangerOutline: Color.lerp(
        btnDangerOutline,
        other.btnDangerOutline,
        t,
      )!,
      inputBg: Color.lerp(inputBg, other.inputBg, t)!,
      inputNormal: Color.lerp(inputNormal, other.inputNormal, t)!,
      inputPrimary: Color.lerp(inputPrimary, other.inputPrimary, t)!,
      txtMuted: Color.lerp(txtMuted, other.txtMuted, t)!,
      txtNormal: Color.lerp(txtNormal, other.txtNormal, t)!,
      txtReverse: Color.lerp(txtReverse, other.txtReverse, t)!,
      txtError: Color.lerp(txtError, other.txtError, t)!,
      txtSuccess: Color.lerp(txtSuccess, other.txtSuccess, t)!,
    );
  }
}
