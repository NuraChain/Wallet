import 'package:flutter/material.dart';

import '../../app.dart';
import '../../application/settings_controller.dart';
import '../../core/l10n/app_localizations.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_surface.dart';
import '../widgets/nura_text.dart';
import 'create_wallet_sheet.dart';
import 'import_wallet_sheet.dart';
import 'language_sheet.dart';

/// The three slides a first-time user is shown.
const List<({IconData icon, String header, String message})> _slides =
    <({IconData icon, String header, String message})>[
      (
        icon: Icons.public,
        header: 'Intro.Connect.Header',
        message: 'Intro.Connect.Message',
      ),
      (
        icon: Icons.hub_outlined,
        header: 'Intro.Decentralized.Header',
        message: 'Intro.Decentralized.Message',
      ),
      (
        icon: Icons.shield_outlined,
        header: 'Intro.Secure.Header',
        message: 'Intro.Secure.Message',
      ),
    ];

/// The first screen on a device with no wallet.
///
/// Carousel, then the two ways in. The language and theme controls sit here rather than behind a
/// settings screen because this is the only screen a user can reach before they have a wallet, and a
/// user who cannot read the interface cannot get past it.
class IntroScreen extends StatefulWidget {
  const IntroScreen({super.key});

  @override
  State<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends State<IntroScreen> {
  final PageController _pages = PageController();

  int _page = 0;

  @override
  void dispose() {
    _pages.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = SettingsScope.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            // The design was drawn for a 360px column; on a desktop window it centres rather than
            // stretching, which is what keeps the carousel from becoming a letterbox.
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(NuraMetrics.gapLarge),
              child: Column(
                children: <Widget>[
                  _TopBar(settings: settings),
                  const SizedBox(height: NuraMetrics.gapLarge),

                  Expanded(
                    child: PageView.builder(
                      controller: _pages,
                      itemCount: _slides.length,
                      onPageChanged: (index) => setState(() => _page = index),
                      itemBuilder: (context, index) =>
                          _Slide(slide: _slides[index]),
                    ),
                  ),

                  const SizedBox(height: NuraMetrics.gap),
                  _Dots(count: _slides.length, active: _page),
                  const SizedBox(height: NuraMetrics.gapLarge),

                  NuraButton(
                    text: context.t('Intro.Create'),
                    variant: NuraButtonVariant.primary,
                    size: NuraButtonSize.action,
                    fullWidth: true,
                    leading: const Icon(Icons.add_circle_outline),
                    onPressed: () => NuraSheet.show<void>(
                      context,
                      builder: (context) => const CreateWalletSheet(),
                    ),
                  ),
                  const SizedBox(height: NuraMetrics.gapSmall),

                  NuraButton(
                    text: context.t('Intro.Import'),
                    variant: NuraButtonVariant.normal,
                    size: NuraButtonSize.action,
                    fullWidth: true,
                    leading: const Icon(Icons.download_outlined),
                    onPressed: () => NuraSheet.show<void>(
                      context,
                      builder: (context) => const ImportWalletSheet(),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.settings});

  final SettingsController settings;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Row(
      children: <Widget>[
        NuraButton(
          variant: NuraButtonVariant.chip,
          size: NuraButtonSize.iconChip,
          semanticLabel: context.t('Intro.Select'),
          onPressed: () => showLanguageSheet(context, settings),
          child: const Icon(Icons.language),
        ),
        const SizedBox(width: NuraMetrics.gapSmall),
        NuraText(
          settings.language.emoji,
          variant: NuraTextVariant.captionStrong,
        ),
        const Spacer(),
        NuraButton(
          variant: NuraButtonVariant.chip,
          size: NuraButtonSize.iconChip,
          semanticLabel: context.t('Dashboard.Settings.Theme'),
          // Toggling from whatever is currently *shown* rather than from the stored choice, so the
          // first tap always visibly flips. Reading the stored value would make a user on `system`
          // tap once with no effect if the OS already matched.
          onPressed: () =>
              settings.setTheme(dark ? ThemeChoice.light : ThemeChoice.dark),
          child: Icon(
            dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
          ),
        ),
      ],
    );
  }
}

class _Slide extends StatelessWidget {
  const _Slide({required this.slide});

  final ({IconData icon, String header, String message}) slide;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        IconBox(
          tone: IconBoxTone.primary,
          size: 72,
          child: Icon(slide.icon, size: 36),
        ),
        const SizedBox(height: NuraMetrics.gapLarge),
        NuraText(
          context.t(slide.header),
          variant: NuraTextVariant.heading,
          align: TextAlign.center,
        ),
        const SizedBox(height: NuraMetrics.gapSmall),
        NuraText(
          context.t(slide.message),
          variant: NuraTextVariant.bodyMuted,
          align: TextAlign.center,
        ),
      ],
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.active});

  final int count;
  final int active;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: i == active ? 18 : 6,
            height: 6,
            decoration: BoxDecoration(
              color: i == active ? colors.btnPrimary : colors.btnMuted,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
      ],
    );
  }
}
