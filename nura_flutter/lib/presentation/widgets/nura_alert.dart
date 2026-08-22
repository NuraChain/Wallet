import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'nura_text.dart';

/// The three shapes a warning takes in this design.
///
/// All three carry the same tinted error ground; what differs is the arrangement, and each is used
/// somewhere specific. [error] is centred and short — a form's rejection. [warning] carries a glyph
/// and reads as a paragraph — the "this cannot be undone" notes. [danger] is start-aligned prose
/// without the glyph — the dApp approval notices, where the sheet already has an icon of its own.
enum NuraAlertVariant { error, warning, danger }

/// An inline warning.
///
/// Renders nothing at all for empty text. Every call site in the Tauri build passes a message that
/// is empty until something goes wrong, and returning an empty widget is what lets them stay
/// unconditional — a spacer that appears before there is anything to say is worse than the branch.
class NuraAlert extends StatelessWidget {
  const NuraAlert({
    super.key,
    required this.text,
    this.variant = NuraAlertVariant.error,
  });

  final String text;
  final NuraAlertVariant variant;

  @override
  Widget build(BuildContext context) {
    if (text.isEmpty) {
      return const SizedBox.shrink();
    }

    final colors = context.colors;

    final label = NuraText(
      text,
      variant: NuraTextVariant.caption,
      color: colors.txtError,
      align: variant == NuraAlertVariant.error
          ? TextAlign.center
          : TextAlign.start,
    );

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: NuraMetrics.gap,
        vertical: NuraMetrics.gapSmall,
      ),
      decoration: BoxDecoration(
        // The 10% error tint the stylesheet uses for all three.
        color: colors.txtError.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(
          variant == NuraAlertVariant.warning
              ? NuraMetrics.radiusMedium
              : NuraMetrics.radiusSmall,
        ),
      ),
      child: variant == NuraAlertVariant.warning
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(
                  Icons.warning_amber_rounded,
                  size: 16,
                  color: colors.txtError,
                ),
                const SizedBox(width: NuraMetrics.gapSmall),
                Expanded(child: label),
              ],
            )
          : label,
    );
  }
}
