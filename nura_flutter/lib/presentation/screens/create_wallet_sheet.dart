import 'package:bip39/bip39.dart' as bip39;
import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/l10n/app_localizations.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_alert.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_text.dart';
import 'credentials_form.dart';

/// Creates a wallet: a fresh recovery phrase, sealed under a passphrase the user chooses.
///
/// The phrase is generated here and handed straight to the session controller, which seals it before
/// it touches disk. It is never held in this widget's state beyond the call, never logged, and never
/// put in a field the platform might autofill or back up.
///
/// 128 bits of entropy — twelve words — matching what `ethers.Wallet.createRandom` produced in the
/// Tauri build. Changing it to twenty-four would be strictly stronger and would also mean a phrase
/// written down from one build looks wrong beside the other, so it stays.
class CreateWalletSheet extends StatefulWidget {
  const CreateWalletSheet({super.key});

  @override
  State<CreateWalletSheet> createState() => _CreateWalletSheetState();
}

class _CreateWalletSheetState extends State<CreateWalletSheet> {
  String _error = '';

  Future<void> _create(String password) async {
    final session = SessionScope.of(context);

    final String phrase;

    try {
      // 128 bits, which bip39 turns into twelve words. The entropy comes from the platform CSPRNG
      // inside the package; nothing here supplies a seed of its own.
      phrase = bip39.generateMnemonic(strength: 128);
    } on Object {
      setState(() => _error = context.t('Intro.CreateWallet.ErrorGenerate'));

      return;
    }

    try {
      await session.adopt(phrase, password);
    } on Object {
      if (mounted) {
        setState(() => _error = context.t('Intro.CreateWallet.ErrorSave'));
      }

      return;
    }

    // The session stage change swaps the whole screen underneath, so the sheet is dismissed rather
    // than left sitting over a dashboard it no longer belongs to.
    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return NuraSheet(
      onClose: () => Navigator.of(context).pop(),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NuraText(
            context.t('Intro.CreateWallet.Title'),
            variant: NuraTextVariant.heading,
            align: TextAlign.center,
          ),
          const SizedBox(height: NuraMetrics.gapTight),
          NuraText(
            context.t('Intro.CreateWallet.Subtitle'),
            variant: NuraTextVariant.bodyMuted,
            align: TextAlign.center,
          ),
          const SizedBox(height: NuraMetrics.gapLarge),

          if (_error.isNotEmpty) ...<Widget>[
            NuraAlert(text: _error),
            const SizedBox(height: NuraMetrics.gap),
          ],

          CredentialsForm(
            prefix: 'Intro.CreateWallet',
            submitKey: 'Submit',
            onError: (message) => setState(() => _error = message),
            onSubmit: _create,
          ),
        ],
      ),
    );
  }
}
