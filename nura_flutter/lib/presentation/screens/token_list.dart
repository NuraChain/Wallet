import 'package:flutter/material.dart';

import '../../app.dart';
import '../../application/token_controller.dart';
import '../../data/repositories/balance_repository.dart';
import '../../core/l10n/app_localizations.dart';
import '../../domain/chain/token.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_alert.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_field.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_surface.dart';
import '../widgets/nura_text.dart';

/// The tracked tokens for the active chain, with their balances.
class TokenList extends StatelessWidget {
  const TokenList({super.key, required this.tokens});

  final TokenController tokens;

  @override
  Widget build(BuildContext context) {
    final networks = NetworkScope.of(context);
    final chainId = networks.active.chainId;

    return AnimatedBuilder(
      animation: tokens,
      builder: (context, _) {
        final tracked = tokens.tracked(chainId);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            SectionHeader(
              title: context.t('Dashboard.Tokens.Title'),
              trailing: NuraButton(
                variant: NuraButtonVariant.chip,
                size: NuraButtonSize.iconChip,
                semanticLabel: context.t('Dashboard.Tokens.Add'),
                onPressed: () => _addToken(context),
                child: const Icon(Icons.add, size: 16),
              ),
            ),
            const SizedBox(height: NuraMetrics.gapSmall),

            if (tracked.isEmpty)
              EmptyState(text: context.t('Dashboard.Tokens.Empty'), panel: true)
            else
              for (final token in tracked) ...<Widget>[
                _TokenRow(
                  token: token,
                  balance: tokens.balanceOf(chainId, token.address),
                  onRemove: () => tokens.remove(chainId, token.address),
                ),
                const SizedBox(height: NuraMetrics.gapSmall),
              ],
          ],
        );
      },
    );
  }

  Future<void> _addToken(BuildContext context) async {
    await NuraModal.show<void>(
      context,
      builder: (sheet) => _AddTokenSheet(tokens: tokens),
    );
  }
}

class _TokenRow extends StatelessWidget {
  const _TokenRow({
    required this.token,
    required this.balance,
    required this.onRemove,
  });

  final Token token;
  final TokenBalance? balance;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return GlassPanel(
      radius: NuraMetrics.radiusMedium,
      // No blur: this row repeats down a list, and a backdrop filter per row is the one shape of
      // blur that reliably costs frames while scrolling.
      blur: false,
      padding: const EdgeInsets.all(NuraMetrics.gap),
      child: Row(
        children: <Widget>[
          IconBox(
            tone: IconBoxTone.badge,
            child: NuraText(
              token.symbol.isEmpty ? '?' : token.symbol.characters.first,
              variant: NuraTextVariant.captionStrong,
            ),
          ),
          const SizedBox(width: NuraMetrics.gapSmall),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                NuraText(
                  token.symbol,
                  variant: NuraTextVariant.captionStrong,
                  maxLines: 1,
                ),
                NuraText(token.name, maxLines: 1),
              ],
            ),
          ),
          const SizedBox(width: NuraMetrics.gapSmall),

          // An em dash until the balance has been read. Zero would be a claim about the account
          // that the wallet has not yet checked.
          NuraText(
            balance?.balance.display() ?? '—',
            variant: NuraTextVariant.captionStrong,
            mono: true,
            forceLtr: true,
          ),
          const SizedBox(width: NuraMetrics.gapTight),

          NuraButton(
            variant: NuraButtonVariant.bare,
            semanticLabel: context.t('Dashboard.Tokens.Remove'),
            onPressed: onRemove,
            child: Icon(Icons.close, size: 14, color: context.colors.txtMuted),
          ),
        ],
      ),
    );
  }
}

class _AddTokenSheet extends StatefulWidget {
  const _AddTokenSheet({required this.tokens});

  final TokenController tokens;

  @override
  State<_AddTokenSheet> createState() => _AddTokenSheetState();
}

class _AddTokenSheetState extends State<_AddTokenSheet> {
  final TextEditingController _contract = TextEditingController();

  bool _busy = false;
  String _error = '';

  @override
  void dispose() {
    _contract.dispose();

    super.dispose();
  }

  Future<void> _submit() async {
    final networks = NetworkScope.of(context);
    final session = SessionScope.of(context);

    final owner = session.address;

    if (owner == null || _busy) {
      return;
    }

    setState(() {
      _busy = true;
      _error = '';
    });

    final issue = await widget.tokens.add(
      networks.active,
      networks.client,
      _contract.text,
      owner,
    );

    if (!mounted) {
      return;
    }

    if (issue == null) {
      Navigator.of(context).pop();

      return;
    }

    setState(() {
      _busy = false;
      _error = context.t(
        issue == TokenIssue.alreadyTracked
            ? 'Dashboard.Tokens.Exists'
            : 'Dashboard.Tokens.NotFound',
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return NuraModal(
      scroll: true,
      onClose: () => Navigator.of(context).pop(),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NuraModalHeader(
            title: context.t('Dashboard.Tokens.Add'),
            onClose: () => Navigator.of(context).pop(),
          ),
          const SizedBox(height: NuraMetrics.gap),

          if (_error.isNotEmpty) ...<Widget>[
            NuraAlert(text: _error),
            const SizedBox(height: NuraMetrics.gap),
          ],

          NuraTextField(
            controller: _contract,
            hint: context.t('Dashboard.Tokens.ContractHint'),
            maxLines: 2,
            textDirection: TextDirection.ltr,
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: NuraMetrics.gap),

          NuraButton(
            text: _busy
                ? context.t('Dashboard.Tokens.Checking')
                : context.t('Dashboard.Tokens.Save'),
            variant: NuraButtonVariant.primary,
            size: NuraButtonSize.action,
            fullWidth: true,
            loading: _busy,
            onPressed: _busy ? null : _submit,
          ),
        ],
      ),
    );
  }
}
