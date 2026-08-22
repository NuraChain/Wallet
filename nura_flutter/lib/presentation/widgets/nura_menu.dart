import 'package:flutter/material.dart';

import '../../core/l10n/app_localizations.dart';
import '../theme/app_theme.dart';
import 'nura_button.dart';
import 'nura_surface.dart';
import 'nura_text.dart';

/// A settings-style row: leading icon box, label, trailing detail.
///
/// The tall muted button the settings dialog stacks — icon in a neutral square, label filling the
/// middle, and whatever the row points at on the end. That trailing slot is either a [NuraChevron],
/// when the row opens something, or the current value, when the row *is* the setting; the two read
/// differently on purpose, so a row that changes something in place is not mistaken for one that
/// leads somewhere else.
class NuraMenuRow extends StatelessWidget {
  const NuraMenuRow({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.trailing,
  });

  final Widget icon;
  final String label;
  final VoidCallback onPressed;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return NuraButton(
      variant: NuraButtonVariant.muted,
      onPressed: onPressed,
      padding: const EdgeInsets.symmetric(horizontal: NuraMetrics.gap),
      child: SizedBox(
        height: NuraMetrics.menuRowHeight,
        child: Row(
          children: <Widget>[
            IconBox(child: icon),
            const SizedBox(width: NuraMetrics.gap),
            // The label takes the slack rather than the row distributing it, so every trailing
            // detail in a stack of these lands on the same edge whatever its label is doing.
            Expanded(
              child: NuraText(
                label,
                variant: NuraTextVariant.body,
                align: TextAlign.start,
                maxLines: 1,
              ),
            ),
            if (trailing != null) ...<Widget>[
              const SizedBox(width: NuraMetrics.gapSmall),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}

/// The "go here" arrow on the end of a row that opens something.
///
/// Points the way the language reads. A chevron is one of the few glyphs whose meaning is direction
/// itself, so leaving it pointing right in Persian would aim it back at where the user came from.
class NuraChevron extends StatelessWidget {
  const NuraChevron({super.key});

  @override
  Widget build(BuildContext context) {
    return Icon(
      context.direction == TextDirection.rtl
          ? Icons.chevron_left
          : Icons.chevron_right,
      size: 18,
      color: context.colors.txtMuted,
    );
  }
}
