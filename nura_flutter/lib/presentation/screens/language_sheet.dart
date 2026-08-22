import 'package:flutter/material.dart';

import '../../application/settings_controller.dart';
import '../../core/l10n/app_localizations.dart';
import '../../core/l10n/translations.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_text.dart';

/// The language picker.
///
/// One dialog, opened from two places: the intro screen's top bar and the settings sheet. It was
/// written twice in the Tauri build and the two copies had already drifted — this is the same list
/// either way, so they cannot.
Future<void> showLanguageSheet(
  BuildContext context,
  SettingsController settings,
) {
  return NuraModal.show<void>(
    context,
    builder: (sheet) => NuraModal(
      scroll: true,
      onClose: () => Navigator.of(sheet).pop(),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NuraModalHeader(
            title: sheet.t('Intro.Select'),
            onClose: () => Navigator.of(sheet).pop(),
          ),
          const SizedBox(height: NuraMetrics.gap),
          for (final language in AppLanguage.values) ...<Widget>[
            NuraButton(
              variant: language == settings.language
                  ? NuraButtonVariant.primary
                  : NuraButtonVariant.muted,
              size: NuraButtonSize.action,
              fullWidth: true,
              onPressed: () {
                settings.setLanguage(language);

                Navigator.of(sheet).pop();
              },
              child: Row(
                children: <Widget>[
                  NuraText(
                    language.emoji,
                    variant: NuraTextVariant.captionStrong,
                  ),
                  const SizedBox(width: NuraMetrics.gapSmall),
                  NuraText(
                    language.code.toUpperCase(),
                    variant: NuraTextVariant.body,
                  ),
                ],
              ),
            ),
            const SizedBox(height: NuraMetrics.gapSmall),
          ],
        ],
      ),
    ),
  );
}
