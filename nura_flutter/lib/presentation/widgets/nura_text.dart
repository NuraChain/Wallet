import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The six pairings of size and colour the design allows.
///
/// A closed set on purpose, carried over from the Tauri `Text` component. Every pairing here means
/// something — a caption is muted, a title is bold — and naming them is what stops a caption drifting
/// onto a body size in one screen and not another. A widget that needs something outside this set is
/// asking for a design decision, not a style override.
enum NuraTextVariant {
  /// 12px muted. Labels, hints, the left-hand side of a detail row.
  caption,

  /// 12px in the normal colour. The same size as [caption]; the difference is emphasis, which is the
  /// whole distinction a label/value row is built on.
  captionStrong,

  /// 14px. Running text.
  body,

  /// 14px muted. Running text that is secondary.
  bodyMuted,

  /// 16px bold. Dialog titles.
  title,

  /// 18px semibold. Section headings.
  heading,

  /// 30px bold. The balance figure, and nothing else.
  display,
}

/// The app's typography primitive.
///
/// Renders one of the pairings above so a size cannot drift away from its colour. Anything a call
/// site genuinely needs on top — truncation, alignment, a monospace face for an address — rides in
/// through the named parameters rather than through a free-form style, which keeps the set of things
/// that can vary small and visible.
class NuraText extends StatelessWidget {
  const NuraText(
    this.text, {
    super.key,
    this.variant = NuraTextVariant.caption,
    this.align,
    this.maxLines,
    this.overflow,
    this.mono = false,
    this.forceLtr = false,
    this.color,
  });

  final String text;
  final NuraTextVariant variant;
  final TextAlign? align;
  final int? maxLines;
  final TextOverflow? overflow;

  /// Renders in a monospace face, for hashes and addresses.
  final bool mono;

  /// Pins this run left-to-right regardless of the app's direction.
  ///
  /// Addresses, hashes and hosts are not language. Laid out right-to-left inside a Persian screen
  /// their characters keep their order but the *run* reverses against the surrounding text, which is
  /// how a `0x` prefix ends up on the wrong end and how a lookalike host goes unnoticed.
  final bool forceLtr;

  /// Overrides the variant's colour. Used where the design deliberately recolours a run — an error
  /// message, a positive balance change — and nowhere else.
  final Color? color;

  TextStyle _style(BuildContext context) {
    final type = context.type;
    final colors = context.colors;

    final base = switch (variant) {
      NuraTextVariant.caption => type.tiny,
      NuraTextVariant.captionStrong => type.tiny.copyWith(
        color: colors.txtNormal,
      ),
      NuraTextVariant.body => type.small,
      NuraTextVariant.bodyMuted => type.small.copyWith(color: colors.txtMuted),
      NuraTextVariant.title => type.medium,
      NuraTextVariant.heading => type.large,
      NuraTextVariant.display => type.display,
    };

    return base.copyWith(
      color: color ?? base.color,
      fontFamily: mono ? _monoFamily : base.fontFamily,
      fontFamilyFallback: mono ? _monoFallback : null,
    );
  }

  /// Flutter has no portable monospace alias, so the platform faces are named directly. Consolas
  /// ships with Windows and Roboto Mono with Android; the rest are ordinary fallbacks.
  static const String _monoFamily = 'Consolas';
  static const List<String> _monoFallback = <String>[
    'Roboto Mono',
    'Droid Sans Mono',
    'Courier New',
    'monospace',
  ];

  @override
  Widget build(BuildContext context) {
    final child = Text(
      text,
      style: _style(context),
      textAlign: align,
      maxLines: maxLines,
      overflow: overflow ?? (maxLines != null ? TextOverflow.ellipsis : null),
    );

    return forceLtr
        ? Directionality(textDirection: TextDirection.ltr, child: child)
        : child;
  }
}
