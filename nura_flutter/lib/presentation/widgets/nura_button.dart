import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/tokens.dart';
import 'nura_surface.dart';
import 'nura_text.dart';

/// The eight fills a button can take.
///
/// One per role, not per colour. `danger` and `destructive` look different and both destroy
/// something: `danger` is the quiet red-on-muted used where the destructive act is *not* the
/// emphasised choice — logging out, clearing history — and `destructive` is the filled red used
/// where it is. Collapsing them would silently re-emphasise several dialogs.
enum NuraButtonVariant {
  /// No fill at all. For controls with their own complete look — nav tabs, window controls.
  bare,
  primary,
  secondary,
  normal,
  muted,
  chip,
  danger,
  destructive,
}

/// The recurring dimensions. A button is one of these or it states its own size.
enum NuraButtonSize {
  none,

  /// `h-11`, the full-width action row at the bottom of a dialog.
  action,

  /// `size-8`.
  icon,

  /// `size-9`, the capsule used over busy content.
  iconChip,

  /// `size-10`.
  iconLarge,
}

/// The one button implementation.
///
/// Fidelity to the original comes from three details that are easy to leave out and obvious when
/// missing: the resting drop shadow, the one-pixel lift on hover, and the settle back down with a
/// slight scale on press. On a touch screen the hover state never fires, so the press is all there
/// is — which is why it is a scale rather than only a colour change.
///
/// Focus is a visible ring, not a colour shift. Windows users tab through these, and a control whose
/// focus is only a tint is a control that cannot be operated from the keyboard with confidence.
class NuraButton extends StatefulWidget {
  const NuraButton({
    super.key,
    this.onPressed,
    this.text,
    this.child,
    this.variant = NuraButtonVariant.bare,
    this.size = NuraButtonSize.none,
    this.loading = false,
    this.fullWidth = false,
    this.leading,
    this.trailing,
    this.semanticLabel,
    this.padding,
  }) : assert(
         text != null || child != null,
         'a button needs either text or a child',
       );

  /// Null disables the button. There is no separate `enabled` flag, so a control cannot claim to be
  /// enabled while having nothing to do.
  final VoidCallback? onPressed;

  final String? text;
  final Widget? child;
  final NuraButtonVariant variant;
  final NuraButtonSize size;

  /// Shows a spinner before the label. The label stays the caller's, so a button can say "Sending…"
  /// while busy without this widget guessing at wording.
  final bool loading;

  final bool fullWidth;
  final Widget? leading;
  final Widget? trailing;

  /// The accessible name, for icon-only buttons that have no text to read.
  final String? semanticLabel;

  final EdgeInsetsGeometry? padding;

  bool get _enabled => onPressed != null && !loading;

  @override
  State<NuraButton> createState() => _NuraButtonState();
}

class _NuraButtonState extends State<NuraButton> {
  bool _hovered = false;
  bool _pressed = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final style = _resolve(colors);

    final enabled = widget._enabled;

    final radius = BorderRadius.circular(switch (widget.size) {
      NuraButtonSize.action => NuraMetrics.radiusMedium,
      NuraButtonSize.iconChip => NuraMetrics.radiusMedium,
      NuraButtonSize.icon ||
      NuraButtonSize.iconLarge => NuraMetrics.radiusSmall,
      NuraButtonSize.none => NuraMetrics.radiusMedium,
    });

    final fill = !enabled
        ? style.background
        : _pressed
        ? style.active
        : _hovered
        ? style.hover
        : style.background;

    Widget content = _content(context, style);

    if (widget.size != NuraButtonSize.none ||
        widget.variant != NuraButtonVariant.bare) {
      content = Padding(
        padding:
            widget.padding ??
            switch (widget.size) {
              NuraButtonSize.action => const EdgeInsets.symmetric(
                horizontal: NuraMetrics.gapLarge,
              ),
              NuraButtonSize.none => const EdgeInsets.symmetric(
                horizontal: NuraMetrics.gap,
                vertical: NuraMetrics.gapSmall,
              ),
              _ => EdgeInsets.zero,
            },
        child: content,
      );
    }

    final (double? width, double? height) = switch (widget.size) {
      NuraButtonSize.action => (null, NuraMetrics.actionHeight),
      NuraButtonSize.icon => (NuraMetrics.iconButton, NuraMetrics.iconButton),
      NuraButtonSize.iconChip => (NuraMetrics.iconChip, NuraMetrics.iconChip),
      NuraButtonSize.iconLarge => (
        NuraMetrics.iconLarge,
        NuraMetrics.iconLarge,
      ),
      NuraButtonSize.none => (null, null),
    };

    Widget body = AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
      width: width,
      height: height,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: radius,
        border: style.border == null ? null : Border.all(color: style.border!),
        boxShadow: style.elevated && enabled
            ? <BoxShadow>[
                BoxShadow(
                  color: colors.glassShadow,
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: content,
    );

    // The chip variant is glass, so it blurs what is behind it like every other glass surface.
    if (widget.variant == NuraButtonVariant.chip) {
      body = ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 5, sigmaY: 5),
          child: body,
        ),
      );
    }

    // Hover lifts by a pixel; press settles back and scales in slightly. Both are no-ops when the
    // button is disabled, so a dead control never appears to respond.
    final lift = enabled && _hovered && !_pressed ? -1.0 : 0.0;
    final scale = enabled && _pressed
        ? (widget.variant == NuraButtonVariant.chip ? 0.95 : 0.99)
        : 1.0;

    return Semantics(
      button: true,
      enabled: enabled,
      label: widget.semanticLabel,
      child: FocusableActionDetector(
        enabled: enabled,
        mouseCursor: enabled
            ? SystemMouseCursors.click
            : SystemMouseCursors.forbidden,
        onShowHoverHighlight: (value) => setState(() => _hovered = value),
        onShowFocusHighlight: (value) => setState(() => _focused = value),
        actions: <Type, Action<Intent>>{
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              widget.onPressed?.call();

              return null;
            },
          ),
        },
        child: GestureDetector(
          onTap: enabled ? widget.onPressed : null,
          onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
          onTapUp: enabled ? (_) => setState(() => _pressed = false) : null,
          onTapCancel: enabled ? () => setState(() => _pressed = false) : null,
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: enabled ? 1 : 0.5,
            child: AnimatedScale(
              duration: const Duration(milliseconds: 120),
              scale: scale,
              child: AnimatedSlide(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                offset: Offset(0, lift / 100),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: radius,
                    // The focus ring sits outside the control, matching `outline-offset-2`.
                    border: _focused && enabled
                        ? Border.all(color: style.outline, width: 2)
                        : null,
                  ),
                  position: DecorationPosition.foreground,
                  child: SizedBox(
                    width: widget.fullWidth ? double.infinity : null,
                    child: body,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, _ButtonStyle style) {
    final label = widget.text == null
        ? widget.child!
        : NuraText(
            widget.text!,
            variant: NuraTextVariant.body,
            color: style.foreground,
            maxLines: 1,
          );

    final pieces = <Widget>[
      if (widget.loading) ...<Widget>[
        NuraSpinner(size: 16, color: style.foreground),
        const SizedBox(width: NuraMetrics.gapSmall),
      ],
      if (widget.leading != null) ...<Widget>[
        widget.leading!,
        const SizedBox(width: NuraMetrics.gapSmall),
      ],
      Flexible(child: label),
      if (widget.trailing != null) ...<Widget>[
        const SizedBox(width: NuraMetrics.gapSmall),
        widget.trailing!,
      ],
    ];

    final row = pieces.length == 1
        ? label
        : Row(
            mainAxisSize: widget.fullWidth
                ? MainAxisSize.max
                : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: pieces,
          );

    return IconTheme.merge(
      data: IconThemeData(color: style.foreground, size: 16),
      child: row,
    );
  }

  _ButtonStyle _resolve(NuraColors c) => switch (widget.variant) {
    NuraButtonVariant.bare => _ButtonStyle(
      background: Colors.transparent,
      hover: Colors.transparent,
      active: Colors.transparent,
      foreground: c.txtNormal,
      outline: c.btnMutedOutline,
      elevated: false,
    ),
    NuraButtonVariant.primary => _ButtonStyle(
      background: c.btnPrimary,
      hover: c.btnPrimaryHover,
      active: c.btnPrimaryActive,
      border: c.btnPrimaryBorder,
      foreground: c.txtReverse,
      outline: c.btnPrimaryOutline,
    ),
    NuraButtonVariant.secondary => _ButtonStyle(
      background: c.btnSecondary,
      hover: c.btnSecondaryHover,
      active: c.btnSecondaryActive,
      border: c.btnSecondaryBorder,
      foreground: c.txtReverse,
      outline: c.btnSecondaryOutline,
    ),
    NuraButtonVariant.normal => _ButtonStyle(
      background: c.btnNormal,
      hover: c.btnNormalHover,
      active: c.btnNormalActive,
      border: c.btnNormalBorder,
      foreground: c.txtNormal,
      outline: c.btnNormalOutline,
    ),
    NuraButtonVariant.muted => _ButtonStyle(
      background: c.btnMuted,
      hover: c.btnMutedHover,
      active: c.btnMutedActive,
      border: c.btnMutedBorder,
      foreground: c.txtMuted,
      outline: c.btnMutedOutline,
    ),
    NuraButtonVariant.chip => _ButtonStyle(
      background: c.base3,
      hover: c.btnNormalHover,
      active: c.btnNormalActive,
      border: c.glassBorder,
      foreground: c.txtNormal,
      outline: c.btnMutedOutline,
      elevated: false,
    ),
    // The quiet destructive: a muted fill carrying error-coloured text.
    NuraButtonVariant.danger => _ButtonStyle(
      background: c.btnMuted,
      hover: c.btnMutedHover,
      active: c.btnMutedActive,
      border: c.btnMutedBorder,
      foreground: c.txtError,
      outline: c.btnMutedOutline,
    ),
    NuraButtonVariant.destructive => _ButtonStyle(
      background: c.btnDanger,
      hover: c.btnDangerHover,
      active: c.btnDangerActive,
      border: c.btnDangerBorder,
      foreground: c.txtReverse,
      outline: c.btnDangerOutline,
    ),
  };
}

@immutable
class _ButtonStyle {
  const _ButtonStyle({
    required this.background,
    required this.hover,
    required this.active,
    required this.foreground,
    required this.outline,
    this.border,
    this.elevated = true,
  });

  final Color background;
  final Color hover;
  final Color active;
  final Color foreground;
  final Color outline;
  final Color? border;
  final bool elevated;
}
