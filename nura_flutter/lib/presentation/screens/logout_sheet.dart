import 'package:flutter/material.dart';

import '../../application/session_controller.dart';
import '../../core/l10n/app_localizations.dart';
import '../../domain/wallet/hd_wallet.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_alert.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_field.dart';
import '../widgets/nura_modal.dart';

/// Password-gated wallet removal.
///
/// Logging out wipes the encrypted secret from the device, so the password is checked first — by
/// decrypting the vault, which is [SessionController.forget]'s own gate — and only then is storage
/// cleared.
///
/// The wallet's kind is here only for the warning. What the user needs in order to come back is the
/// phrase or the key they imported, and naming the wrong one is the difference between a recoverable
/// wallet and a lost one.
class LogoutSheet extends StatefulWidget {
  const LogoutSheet({super.key, required this.session});

  final SessionController session;

  @override
  State<LogoutSheet> createState() => _LogoutSheetState();
}

class _LogoutSheetState extends State<LogoutSheet> {
  final TextEditingController _password = TextEditingController();

  String _error = '';
  bool _busy = false;

  @override
  void dispose() {
    _password.dispose();

    super.dispose();
  }

  Future<void> _confirm() async {
    if (_password.text.trim().isEmpty) {
      setState(() => _error = context.t('Dashboard.Logout.ErrorRequired'));

      return;
    }

    setState(() {
      _error = '';
      _busy = true;
    });

    final failure = await widget.session.forget(_password.text);

    if (!mounted) {
      return;
    }

    if (failure == null) {
      // The shell already renders the intro screen for a session with no wallet, but this dialog and
      // the settings dialog underneath it are routes above it and would otherwise stay on screen,
      // sitting over a wallet that no longer exists. Clearing back to the first route is what the
      // Tauri build's `navigate('/intro', { replace: true })` did.
      Navigator.of(context).popUntil((route) => route.isFirst);

      return;
    }

    setState(() {
      _busy = false;

      // A vault too corrupt to parse reports as a wrong password, for want of anywhere better to
      // put it: the two translation bundles are the Tauri app's own files and cannot grow a key
      // without it growing one too. It is unreachable from here in any case — this dialog opens from
      // the dashboard, which is only standing because the vault opened.
      _error = context.t('Dashboard.Logout.ErrorInvalid');
    });
  }

  @override
  Widget build(BuildContext context) {
    void close() => Navigator.of(context).pop();

    return NuraModal(
      scroll: true,
      onClose: close,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NuraModalHeader(
            title: context.t('Dashboard.Logout.Title'),
            onClose: close,
          ),
          const SizedBox(height: NuraMetrics.gap),

          NuraAlert(
            variant: NuraAlertVariant.warning,
            text: widget.session.kind == VaultKind.privateKey
                ? context.t('Dashboard.Logout.MessageKey')
                : context.t('Dashboard.Logout.Message'),
          ),

          if (_error.isNotEmpty) ...<Widget>[
            const SizedBox(height: NuraMetrics.gap),
            NuraAlert(text: _error),
          ],

          const SizedBox(height: NuraMetrics.gap),

          NuraTextField(
            controller: _password,
            label: context.t('Dashboard.Logout.Password'),
            obscure: true,
            onSubmitted: (_) => _confirm(),
            leading: Icon(Icons.lock_outline, color: context.colors.txtMuted),
          ),
          const SizedBox(height: NuraMetrics.gap),

          // Cancel carries the emphasis and the destructive button is the quiet one: this dialog
          // exists to slow the user down, so the prominent control is the way back out rather than
          // the one that wipes the wallet.
          NuraModalActions(
            children: <Widget>[
              NuraButton(
                text: context.t('Dashboard.Logout.Cancel'),
                variant: NuraButtonVariant.primary,
                size: NuraButtonSize.action,
                onPressed: close,
              ),
              NuraButton(
                text: _busy
                    ? context.t('Dashboard.Logout.Pending')
                    : context.t('Dashboard.Logout.Confirm'),
                variant: NuraButtonVariant.danger,
                size: NuraButtonSize.action,
                loading: _busy,
                onPressed: _confirm,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
