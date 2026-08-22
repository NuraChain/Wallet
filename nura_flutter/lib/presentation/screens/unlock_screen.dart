import 'package:flutter/material.dart';

import '../../app.dart';
import '../../application/session_controller.dart';
import '../../core/l10n/app_localizations.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_alert.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_field.dart';
import '../widgets/nura_surface.dart';
import '../widgets/nura_text.dart';

/// The screen a returning user sees: one field, one button.
///
/// Unlocking is deliberately slow. Argon2id at 64 MiB and three passes takes a noticeable fraction
/// of a second on a phone, which is the entire point — it is what makes an offline guess at the
/// passphrase expensive. So the button has a real busy state rather than a spinner that flashes,
/// and the field stays enabled so the user can correct a typo while it works.
///
/// The three failures are told apart. A wrong passphrase is ordinary and says so. A store that will
/// not parse is not the user's fault and must not read like a rejected password — telling them their
/// passphrase is wrong when the file is damaged sends them looking for the wrong problem.
class UnlockScreen extends StatefulWidget {
  const UnlockScreen({super.key});

  @override
  State<UnlockScreen> createState() => _UnlockScreenState();
}

class _UnlockScreenState extends State<UnlockScreen> {
  final TextEditingController _password = TextEditingController();

  bool _busy = false;
  String _error = '';

  @override
  void dispose() {
    _password.dispose();

    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) {
      return;
    }

    final password = _password.text;

    if (password.isEmpty) {
      setState(() => _error = context.t('Unlock.ErrorRequired'));

      return;
    }

    setState(() {
      _busy = true;
      _error = '';
    });

    final failure = await SessionScope.of(context).unlock(password);

    // The controller drives the stage change, so a successful unlock unmounts this screen. Guarding
    // on `mounted` is what keeps that from becoming a setState on a dead element.
    if (!mounted) {
      return;
    }

    setState(() {
      _busy = false;

      _error = switch (failure) {
        null => '',
        UnlockFailure.wrongPassword => context.t('Unlock.ErrorInvalid'),
        UnlockFailure.noWallet => context.t('Unlock.ErrorMissing'),
        UnlockFailure.corrupt => context.t('Unlock.ErrorGeneric'),
      };
    });

    if (failure != null) {
      // Clears only on failure. Wiping a correct passphrase would be pointless, and wiping on every
      // attempt makes a mistyped character cost the whole entry.
      _password.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(NuraMetrics.gapLarge),
            child: ConstrainedBox(
              // Caps the column on a wide window instead of stretching one field across a desktop.
              constraints: const BoxConstraints(
                maxWidth: NuraMetrics.dialogWidth,
              ),
              child: GlassPanel(
                radius: NuraMetrics.radiusPanel,
                padding: const EdgeInsets.all(NuraMetrics.gapLarge),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    IconBox(
                      tone: IconBoxTone.primary,
                      size: NuraMetrics.iconLarge,
                      child: const Icon(Icons.lock_outline),
                    ),
                    const SizedBox(height: NuraMetrics.gap),

                    NuraText(
                      context.t('Unlock.Title'),
                      variant: NuraTextVariant.heading,
                      align: TextAlign.center,
                    ),
                    const SizedBox(height: NuraMetrics.gapTight),

                    NuraText(
                      context.t('Unlock.Subtitle'),
                      variant: NuraTextVariant.bodyMuted,
                      align: TextAlign.center,
                    ),
                    const SizedBox(height: NuraMetrics.gapLarge),

                    NuraTextField(
                      controller: _password,
                      label: context.t('Unlock.Password'),
                      obscure: true,
                      autofocus: true,
                      onSubmitted: (_) => _submit(),
                      leading: Icon(Icons.lock_outline, color: colors.txtMuted),
                    ),

                    if (_error.isNotEmpty) ...<Widget>[
                      const SizedBox(height: NuraMetrics.gap),
                      NuraAlert(text: _error),
                    ],

                    const SizedBox(height: NuraMetrics.gapLarge),

                    NuraButton(
                      text: _busy
                          ? context.t('Unlock.Loading')
                          : context.t('Unlock.Submit'),
                      variant: NuraButtonVariant.primary,
                      size: NuraButtonSize.action,
                      fullWidth: true,
                      loading: _busy,
                      onPressed: _submit,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
