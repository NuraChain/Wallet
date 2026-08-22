import 'package:flutter/material.dart';

import '../../application/session_controller.dart';
import '../../application/settings_controller.dart';
import '../../core/build_info.dart';
import '../../core/l10n/app_localizations.dart';
import '../../domain/wallet/hd_wallet.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_menu.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_text.dart';
import 'language_sheet.dart';
import 'logout_sheet.dart';
import 'phrase_sheet.dart';

/// App settings: language, theme, the recovery phrase, and the two ways out of a session.
///
/// Reached from the gear on the wallet tab rather than from the navigation bar, so the bar stays
/// reserved for the three primary surfaces.
///
/// Account labels are not edited here — they belong to the account switcher, next to the account
/// they rename. Network selection likewise lives on the wallet tab, next to the balance it changes.
class SettingsSheet extends StatelessWidget {
  const SettingsSheet({
    super.key,
    required this.session,
    required this.settings,
  });

  final SessionController session;
  final SettingsController settings;

  /// Which palette is actually on screen right now.
  ///
  /// [ThemeChoice.system] has no fixed answer, so it is resolved against the platform rather than
  /// guessed at: a row that reported "Light" while the device was in dark mode would be describing
  /// a setting instead of the screen the user is looking at.
  Brightness _showing(BuildContext context) => switch (settings.theme) {
    ThemeChoice.light => Brightness.light,
    ThemeChoice.dark => Brightness.dark,
    ThemeChoice.system => MediaQuery.platformBrightnessOf(context),
  };

  @override
  Widget build(BuildContext context) {
    void close() => Navigator.of(context).pop();

    return AnimatedBuilder(
      animation: Listenable.merge(<Listenable>[session, settings]),
      // Everything the panel reads off a controller is read inside this builder. Resolving the
      // theme above it would compute it once, at the moment the dialog opened, and the row would go
      // on reporting that answer after the tap that changed it.
      builder: (context, _) => _panel(context, close),
    );
  }

  Widget _panel(BuildContext context, VoidCallback close) {
    final light = _showing(context) == Brightness.light;

    return NuraModal(
      scroll: true,
      onClose: close,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NuraModalHeader(
            title: context.t('Dashboard.Settings.Title'),
            onClose: close,
          ),
          const SizedBox(height: NuraMetrics.gap),

          NuraMenuRow(
            icon: const Icon(Icons.language),
            label: context.t('Intro.Language'),
            onPressed: () => showLanguageSheet(context, settings),
            trailing: const NuraChevron(),
          ),
          const SizedBox(height: NuraMetrics.gapSmall),

          // The glyph names what the tap will do and the trailing value names where things stand,
          // which is why they disagree: in a light theme the row offers a moon and reads "Light".
          NuraMenuRow(
            icon: Icon(light ? Icons.dark_mode_outlined : Icons.light_mode),
            label: context.t('Dashboard.Settings.Theme'),
            onPressed: () =>
                settings.setTheme(light ? ThemeChoice.dark : ThemeChoice.light),
            trailing: NuraText(
              context.t(
                light
                    ? 'Dashboard.Settings.ThemeLight'
                    : 'Dashboard.Settings.ThemeDark',
              ),
            ),
          ),
          const SizedBox(height: NuraMetrics.gapSmall),

          NuraMenuRow(
            icon: const Icon(Icons.description_outlined),
            label: session.kind == VaultKind.privateKey
                ? context.t('Dashboard.Phrase.TitleKey')
                : context.t('Dashboard.Phrase.Title'),
            onPressed: () => NuraModal.show<void>(
              context,
              builder: (_) => PhraseSheet(session: session),
            ),
            trailing: const NuraChevron(),
          ),
          const SizedBox(height: NuraMetrics.gap),

          // Both end the session, so they share one row rather than a line each.
          NuraModalActions(
            children: <Widget>[
              NuraButton(
                variant: NuraButtonVariant.primary,
                size: NuraButtonSize.action,
                // The dialog goes with the session it belongs to. Locking swaps the shell
                // underneath for the unlock screen, and a settings panel left floating over it
                // would be a panel for a wallet that is no longer open.
                onPressed: () {
                  session.lock();

                  Navigator.of(context).popUntil((route) => route.isFirst);
                },
                leading: const Icon(Icons.lock_outline, size: 16),
                child: NuraText(
                  context.t('Dashboard.Lock'),
                  variant: NuraTextVariant.body,
                  maxLines: 1,
                ),
              ),
              NuraButton(
                variant: NuraButtonVariant.danger,
                size: NuraButtonSize.action,
                onPressed: () => NuraModal.show<void>(
                  context,
                  builder: (_) => LogoutSheet(session: session),
                ),
                leading: const Icon(Icons.logout, size: 16),
                child: NuraText(
                  context.t('Dashboard.Settings.Logout'),
                  variant: NuraTextVariant.body,
                  maxLines: 1,
                ),
              ),
            ],
          ),
          const SizedBox(height: NuraMetrics.gapTight),

          // The last line on the panel, under the actions: it is the sort of thing looked for only
          // when reporting a problem, so it sits below everything that is here to be used rather
          // than between the settings and the buttons that end the session.
          NuraText(
            context.t('Dashboard.Settings.Version', <Object?>[
              BuildInfo.version,
            ]),
            align: TextAlign.center,
            forceLtr: true,
          ),
        ],
      ),
    );
  }
}
