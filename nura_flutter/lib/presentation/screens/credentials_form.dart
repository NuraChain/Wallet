import 'package:flutter/material.dart';

import '../../core/l10n/app_localizations.dart';
import '../../core/security/password_policy.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_field.dart';

/// The passphrase half of both intro flows.
///
/// Shared because creating and importing ask for exactly the same thing and must validate it
/// identically — the Tauri build factored it out for the same reason. [prefix] selects which set of
/// translation keys to read, since the two flows word the same fields differently.
///
/// The submit button is disabled until the acknowledgement is ticked. That is the one piece of
/// friction in this form and it is deliberate: the passphrase cannot be recovered, and a user who
/// has not registered that fact is a user who will lose their wallet to a forgotten password.
class CredentialsForm extends StatefulWidget {
  const CredentialsForm({
    super.key,
    required this.prefix,
    required this.submitKey,
    required this.onSubmit,
    required this.onError,
  });

  /// `Intro.CreateWallet` or `Intro.ImportWallet`.
  final String prefix;

  /// The key under [prefix] naming the submit button.
  final String submitKey;

  /// Runs the flow. Returning normally means it succeeded; throwing is reported by the caller.
  final Future<void> Function(String password) onSubmit;

  final ValueChanged<String> onError;

  @override
  State<CredentialsForm> createState() => _CredentialsFormState();
}

class _CredentialsFormState extends State<CredentialsForm> {
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirm = TextEditingController();

  bool _agreed = false;
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();

    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_agreed) {
      return;
    }

    final issue = PasswordPolicy.check(_password.text, _confirm.text);

    if (issue != null) {
      widget.onError(
        context.t(switch (issue) {
          PasswordIssue.mismatch => '${widget.prefix}.ErrorMismatch',
          PasswordIssue.length => '${widget.prefix}.ErrorLength',
        }),
      );

      return;
    }

    widget.onError('');

    setState(() => _busy = true);

    try {
      await widget.onSubmit(_password.text);
    } finally {
      // The flow usually unmounts this form on success, so the guard is what keeps a completed
      // submit from calling setState on a dead element.
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        NuraTextField(
          controller: _password,
          label: context.t('${widget.prefix}.Password'),
          obscure: true,
        ),
        const SizedBox(height: NuraMetrics.gap),

        NuraTextField(
          controller: _confirm,
          label: context.t('${widget.prefix}.Confirm'),
          obscure: true,
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: NuraMetrics.gapSmall),

        NuraCheckbox(
          checked: _agreed,
          text: context.t('${widget.prefix}.Agreement'),
          onToggle: () => setState(() => _agreed = !_agreed),
        ),
        const SizedBox(height: NuraMetrics.gap),

        NuraButton(
          text: context.t('${widget.prefix}.${widget.submitKey}'),
          variant: NuraButtonVariant.primary,
          size: NuraButtonSize.action,
          fullWidth: true,
          loading: _busy,
          // Null rather than a disabled flag, so the control cannot look available while refusing.
          onPressed: _agreed ? _submit : null,
        ),
      ],
    );
  }
}
