import 'package:bip39/bip39.dart' as bip39;
import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/l10n/app_localizations.dart';
import '../../domain/wallet/hd_wallet.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_alert.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_field.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_text.dart';
import 'credentials_form.dart';

/// Restores a wallet from a recovery phrase or a raw private key.
///
/// Both are accepted because the Tauri build accepted both, and the difference is explained on the
/// screen rather than inferred: a private key restores the one account it belongs to, while a phrase
/// restores every account the wallet ever derived. A user importing a key and then looking for their
/// other accounts is the confusion that note exists to prevent.
class ImportWalletSheet extends StatefulWidget {
  const ImportWalletSheet({super.key});

  @override
  State<ImportWalletSheet> createState() => _ImportWalletSheetState();
}

class _ImportWalletSheetState extends State<ImportWalletSheet> {
  final TextEditingController _secret = TextEditingController();

  VaultKind _method = VaultKind.mnemonic;
  String _error = '';

  @override
  void dispose() {
    _secret.dispose();

    super.dispose();
  }

  /// Validates what was entered, returning the value to store or null after reporting why not.
  ///
  /// A phrase is checked against BIP-39 itself, not merely counted. Twelve valid-looking words with
  /// a wrong checksum derive a perfectly real wallet that is not the user's — they would see an
  /// empty balance and conclude their funds were gone.
  String? _validate() {
    final entered = _secret.text.trim();

    if (_method == VaultKind.privateKey) {
      try {
        HdWallet.addressOfPrivateKey(entered);
      } on Object {
        setState(
          () => _error = context.t('Intro.ImportWallet.ErrorInvalidKey'),
        );

        return null;
      }

      return entered;
    }

    final words = entered.split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final phrase = words.join(' ').toLowerCase();

    if (words.length != 12 && words.length != 24) {
      setState(
        () => _error = context.t('Intro.ImportWallet.ErrorInvalidLength'),
      );

      return null;
    }

    if (!bip39.validateMnemonic(phrase)) {
      setState(
        () => _error = context.t('Intro.ImportWallet.ErrorInvalidLength'),
      );

      return null;
    }

    return phrase;
  }

  Future<void> _import(String password) async {
    final secret = _validate();

    if (secret == null) {
      return;
    }

    try {
      await SessionScope.of(context).adopt(secret, password);
    } on Object {
      if (mounted) {
        setState(() => _error = context.t('Intro.ImportWallet.ErrorGenerate'));
      }

      return;
    }

    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final key = _method == VaultKind.privateKey;

    return NuraSheet(
      onClose: () => Navigator.of(context).pop(),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NuraText(
            context.t('Intro.ImportWallet.Title'),
            variant: NuraTextVariant.heading,
            align: TextAlign.center,
          ),
          const SizedBox(height: NuraMetrics.gapTight),
          NuraText(
            context.t('Intro.ImportWallet.Subtitle'),
            variant: NuraTextVariant.bodyMuted,
            align: TextAlign.center,
          ),
          const SizedBox(height: NuraMetrics.gapLarge),

          Row(
            children: <Widget>[
              for (final option in VaultKind.values) ...<Widget>[
                if (option != VaultKind.values.first)
                  const SizedBox(width: NuraMetrics.gapSmall),
                Expanded(
                  child: NuraButton(
                    text: context.t(
                      option == VaultKind.privateKey
                          ? 'Intro.ImportWallet.MethodKey'
                          : 'Intro.ImportWallet.MethodPhrase',
                    ),
                    variant: _method == option
                        ? NuraButtonVariant.primary
                        : NuraButtonVariant.muted,
                    size: NuraButtonSize.action,
                    // Clears the field on switch. A phrase left behind while the key tab is showing
                    // would be validated as a key, refused, and read as the wallet being rejected.
                    onPressed: () => setState(() {
                      _method = option;
                      _error = '';
                      _secret.clear();
                    }),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: NuraMetrics.gap),

          NuraTextField(
            controller: _secret,
            hint: context.t(
              key
                  ? 'Intro.ImportWallet.MessageKey'
                  : 'Intro.ImportWallet.Message',
            ),
            maxLines: 3,
            // Neither a phrase nor a key is language: pinned left-to-right so the words keep their
            // order on a Persian or Arabic screen.
            textDirection: TextDirection.ltr,
          ),

          if (key) ...<Widget>[
            const SizedBox(height: NuraMetrics.gapSmall),
            NuraText(
              context.t('Intro.ImportWallet.KeyNote'),
              variant: NuraTextVariant.caption,
            ),
          ],

          const SizedBox(height: NuraMetrics.gap),

          if (_error.isNotEmpty) ...<Widget>[
            NuraAlert(text: _error),
            const SizedBox(height: NuraMetrics.gap),
          ],

          CredentialsForm(
            prefix: 'Intro.ImportWallet',
            submitKey: 'Submit2',
            onError: (message) => setState(() => _error = message),
            onSubmit: _import,
          ),
        ],
      ),
    );
  }
}
