import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'nura_text.dart';

/// The frosted panel every card, dialog and toolbar in this design is made of.
///
/// Three things together make the material read as glass: a translucent fill, a blur of what is
/// behind it, and a hairline border catching the light. Drop any one and it looks like a flat card
/// with the wrong opacity.
///
/// The blur is the expensive part. [BackdropFilter] forces the compositor to read back the layer
/// underneath, so one over a scrolling list costs real frames. Two rules keep that in hand: the blur
/// is clipped to the panel's own rounded rectangle rather than left unbounded, and [blur] can be
/// turned off for surfaces drawn many times in a list — the Tauri build made the same trade, which
/// is why its full-screen scrim carries no blur at all.
class GlassPanel extends StatelessWidget {
  const GlassPanel({
    super.key,
    required this.child,
    this.padding,
    this.radius = NuraMetrics.radiusLarge,
    this.blur = true,
    this.shadow = true,
    this.fill,
    this.border,
    this.width,
    this.height,
    this.margin,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double radius;

  /// Whether to blur what is behind. Off for surfaces repeated down a list.
  final bool blur;

  final bool shadow;

  /// Overrides the fill. Defaults to `base-2`, the panel token.
  final Color? fill;

  final Color? border;
  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final corner = BorderRadius.circular(radius);

    final surface = Container(
      width: width,
      height: height,
      padding: padding,
      decoration: BoxDecoration(
        color: fill ?? colors.base2,
        borderRadius: corner,
        border: Border.all(color: border ?? colors.glassBorder),
        boxShadow: shadow
            ? <BoxShadow>[
                BoxShadow(
                  color: colors.glassShadow,
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
              ]
            : null,
      ),
      child: child,
    );

    if (!blur) {
      return margin == null
          ? surface
          : Padding(padding: margin!, child: surface);
    }

    final blurred = ClipRRect(
      borderRadius: corner,
      child: BackdropFilter(
        // 12px in CSS is a Gaussian sigma of roughly half that; saturation is dropped because
        // Flutter has no backdrop-saturate and faking it would tint what is behind the panel.
        filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
        child: surface,
      ),
    );

    return margin == null ? blurred : Padding(padding: margin!, child: blurred);
  }
}

/// The four fills a small square icon holder can take.
enum IconBoxTone { muted, primary, secondary, badge }

/// The rounded square that sits in front of every list row and letter badge.
class IconBox extends StatelessWidget {
  const IconBox({
    super.key,
    required this.child,
    this.tone = IconBoxTone.muted,
    this.size = NuraMetrics.iconButton,
  });

  final Widget child;
  final IconBoxTone tone;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    final (Color background, Color foreground, Color? line) = switch (tone) {
      IconBoxTone.muted => (colors.btnMuted, colors.txtNormal, null),
      IconBoxTone.primary => (colors.btnPrimary, colors.txtReverse, null),
      IconBoxTone.secondary => (colors.btnSecondary, colors.txtReverse, null),
      IconBoxTone.badge => (colors.badge, colors.badgeText, colors.badgeBorder),
    };

    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(NuraMetrics.radiusSmall),
        border: line == null ? null : Border.all(color: line),
      ),
      child: IconTheme.merge(
        data: IconThemeData(color: foreground, size: size * 0.5),
        child: DefaultTextStyle.merge(
          style: TextStyle(color: foreground),
          child: child,
        ),
      ),
    );
  }
}

/// The indeterminate spinner, matching the Tauri build's rotating quarter-circle.
class NuraSpinner extends StatelessWidget {
  const NuraSpinner({super.key, this.size = 16, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CircularProgressIndicator(
        strokeWidth: size <= 16 ? 2 : 2.5,
        // Matches the source's quarter-circle rather than a full ring.
        strokeCap: StrokeCap.round,
        valueColor: AlwaysStoppedAnimation<Color>(
          color ?? context.colors.txtMuted,
        ),
      ),
    );
  }
}

/// What a list shows when it has nothing in it.
///
/// An empty state is not an error and must not read like one: an inbox glyph and a sentence, in the
/// muted colour. The distinction matters most on the history and token lists, where "no
/// transactions yet" and "the explorer could not be reached" are very different facts.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.text, this.panel = false});

  final String text;

  /// Draws the state inside a glass panel, for where it sits among other cards.
  final bool panel;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Icon(Icons.inbox_outlined, size: 24, color: context.colors.txtMuted),
        const SizedBox(height: NuraMetrics.gapTight),
        NuraText(
          text,
          variant: NuraTextVariant.bodyMuted,
          align: TextAlign.center,
        ),
      ],
    );

    if (!panel) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: content,
      );
    }

    return GlassPanel(
      radius: NuraMetrics.radiusMedium,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
      child: content,
    );
  }
}

/// A section title with an optional control on the trailing side.
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Expanded(child: NuraText(title)),
        if (trailing != null) ...<Widget>[
          const SizedBox(width: NuraMetrics.gapSmall),
          trailing!,
        ],
      ],
    );
  }
}
