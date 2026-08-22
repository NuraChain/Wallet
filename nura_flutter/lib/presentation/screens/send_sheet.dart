import 'package:flutter/material.dart';

import '../../app.dart';
import '../../core/l10n/app_localizations.dart';
import '../../data/repositories/balance_repository.dart';
import '../../data/rpc/json_rpc_client.dart';
import '../../domain/chain/transaction_service.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_alert.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_field.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_surface.dart';
import '../widgets/nura_text.dart';

/// Where the send flow is.
///
/// Review is a separate step and not a confirmation dialog. What it shows — the fee, the gas, the
/// recipient — comes from the chain, so there is a network call between filling the form and being
/// asked to commit, and a dialog that appeared instantly with real figures would be lying about
/// where they came from.
enum _Stage { form, review, sending, sent }

/// Sends the native coin.
///
/// The transaction is prepared once, reviewed, and then signed from exactly the object that was
/// reviewed. Re-deriving gas after the user taps confirm is the subtle version of this screen being
/// wrong: the figures they agreed to and the figures that get signed would be different, and a
/// risen base fee would silently make the transaction cost more than the screen said.
class SendSheet extends StatefulWidget {
  const SendSheet({super.key, required this.balance, required this.onSent});

  /// The account's current native balance, for the max hint and the local sufficiency check.
  final BalanceReading balance;

  /// Called after a successful broadcast so the dashboard can re-read the balance.
  final VoidCallback onSent;

  @override
  State<SendSheet> createState() => _SendSheetState();
}

class _SendSheetState extends State<SendSheet> {
  final TextEditingController _to = TextEditingController();
  final TextEditingController _amount = TextEditingController();

  _Stage _stage = _Stage.form;
  String _error = '';
  String _hash = '';

  PreparedTransaction? _prepared;

  @override
  void dispose() {
    _to.dispose();
    _amount.dispose();

    super.dispose();
  }

  Future<void> _review() async {
    final networks = NetworkScope.of(context);
    final session = SessionScope.of(context);

    final issue = TransactionService.validate(
      recipient: _to.text,
      amount: _amount.text,
      decimals: widget.balance.decimals,
      balance: widget.balance.raw,
    );

    if (issue != null) {
      setState(
        () => _error = context.t(switch (issue) {
          TransferIssue.invalidAddress => 'Dashboard.Send.InvalidAddress',
          TransferIssue.invalidAmount => 'Dashboard.Send.InvalidAmount',
          TransferIssue.insufficient => 'Dashboard.Send.Insufficient',
        }),
      );

      return;
    }

    final address = session.address;

    if (address == null) {
      return;
    }

    setState(() {
      _error = '';
      _stage = _Stage.sending;
    });

    try {
      final prepared =
          await TransactionService(networks.client, networks.active).prepare(
            from: address,
            to: _to.text.trim(),
            amount: TransactionService.parseAmount(
              _amount.text,
              widget.balance.decimals,
            )!,
          );

      if (!mounted) {
        return;
      }

      setState(() {
        _prepared = prepared;
        _stage = _Stage.review;
      });
    } on RpcUnreachableException {
      if (mounted) {
        setState(() {
          _stage = _Stage.form;
          _error = context.t('Dashboard.Send.Offline');
        });
      }
    } on RpcErrorException catch (error) {
      if (mounted) {
        setState(() {
          _stage = _Stage.form;
          // The node's own words. "Transaction failed, please try again" would hide the one useful
          // thing the chain said — "insufficient funds for gas", say, which the user can act on.
          _error = error.message;
        });
      }
    }
  }

  Future<void> _confirm() async {
    final networks = NetworkScope.of(context);
    final session = SessionScope.of(context);

    final prepared = _prepared;
    final key = session.privateKeyForSigning();

    // A vault locked between review and confirm leaves nothing to sign with. Refusing is correct;
    // the alternative is signing with a key captured earlier, which would outlive the lock.
    if (prepared == null || key == null) {
      setState(() {
        _stage = _Stage.form;
        _error = context.t('Dashboard.Send.Error');
      });

      return;
    }

    setState(() {
      _stage = _Stage.sending;
      _error = '';
    });

    try {
      final hash = await TransactionService(
        networks.client,
        networks.active,
      ).send(prepared, key);

      if (!mounted) {
        return;
      }

      setState(() {
        _hash = hash;
        _stage = _Stage.sent;
      });

      widget.onSent();
    } on RpcErrorException catch (error) {
      if (mounted) {
        setState(() {
          _stage = _Stage.review;
          _error = error.message;
        });
      }
    } on RpcUnreachableException {
      if (mounted) {
        setState(() {
          _stage = _Stage.review;
          _error = context.t('Dashboard.Send.Offline');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final networks = NetworkScope.of(context);

    return NuraModal(
      scroll: true,
      onClose: () => Navigator.of(context).pop(),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NuraModalHeader(
            title: context.t('Dashboard.Send.Title'),
            onClose: () => Navigator.of(context).pop(),
          ),
          const SizedBox(height: NuraMetrics.gap),

          if (_error.isNotEmpty) ...<Widget>[
            NuraAlert(text: _error),
            const SizedBox(height: NuraMetrics.gap),
          ],

          if (_stage == _Stage.form ||
              _stage == _Stage.sending && _prepared == null)
            ..._form(context)
          else if (_stage == _Stage.sent)
            ..._done(context)
          else
            ..._reviewStep(context, networks.active.symbol),
        ],
      ),
    );
  }

  List<Widget> _form(BuildContext context) {
    final busy = _stage == _Stage.sending;

    return <Widget>[
      NuraTextField(
        controller: _to,
        label: context.t('Dashboard.Send.Recipient'),
        // An address is not language, so it stays left-to-right on a Persian screen.
        textDirection: TextDirection.ltr,
      ),
      const SizedBox(height: NuraMetrics.gap),

      NuraTextField(
        controller: _amount,
        label: context.t('Dashboard.Send.Amount'),
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textDirection: TextDirection.ltr,
      ),
      const SizedBox(height: NuraMetrics.gapTight),

      NuraText(
        context.t('Dashboard.Send.Max', <Object?>[
          '${widget.balance.display()} ${widget.balance.symbol}',
        ]),
      ),
      const SizedBox(height: NuraMetrics.gap),

      NuraButton(
        text: context.t('Dashboard.Send.Review'),
        variant: NuraButtonVariant.primary,
        size: NuraButtonSize.action,
        fullWidth: true,
        loading: busy,
        onPressed: busy ? null : _review,
      ),
    ];
  }

  List<Widget> _reviewStep(BuildContext context, String symbol) {
    final prepared = _prepared!;
    final busy = _stage == _Stage.sending;

    final fee = BalanceReading(
      raw: prepared.maxFee,
      decimals: widget.balance.decimals,
      symbol: symbol,
      at: DateTime.now(),
    );

    return <Widget>[
      GlassPanel(
        radius: NuraMetrics.radiusMedium,
        blur: false,
        shadow: false,
        padding: const EdgeInsets.all(NuraMetrics.gap),
        child: Column(
          children: <Widget>[
            _Row(
              label: context.t('Dashboard.Send.Amount'),
              value: '${_amount.text.trim()} $symbol',
            ),
            const SizedBox(height: NuraMetrics.gapSmall),
            _Row(
              label: context.t('Dashboard.Send.To'),
              value: _to.text.trim(),
              mono: true,
            ),
            const SizedBox(height: NuraMetrics.gapSmall),
            // The ceiling rather than a prediction: the largest amount that can leave the account.
            _Row(
              label: context.t('Dashboard.Request.Fee'),
              value: '${fee.display(places: 8)} $symbol',
            ),
          ],
        ),
      ),
      const SizedBox(height: NuraMetrics.gap),

      NuraModalActions(
        children: <Widget>[
          NuraButton(
            text: context.t('Dashboard.Send.Back'),
            variant: NuraButtonVariant.muted,
            size: NuraButtonSize.action,
            onPressed: busy ? null : () => setState(() => _stage = _Stage.form),
          ),
          NuraButton(
            text: busy
                ? context.t('Dashboard.Send.Pending')
                : context.t('Dashboard.Send.Confirm'),
            variant: NuraButtonVariant.primary,
            size: NuraButtonSize.action,
            loading: busy,
            onPressed: busy ? null : _confirm,
          ),
        ],
      ),
    ];
  }

  List<Widget> _done(BuildContext context) => <Widget>[
    Center(
      child: IconBox(
        tone: IconBoxTone.primary,
        size: NuraMetrics.iconLarge,
        child: const Icon(Icons.check),
      ),
    ),
    const SizedBox(height: NuraMetrics.gap),

    NuraText(
      context.t('Dashboard.Send.Success'),
      variant: NuraTextVariant.title,
      align: TextAlign.center,
    ),
    const SizedBox(height: NuraMetrics.gapSmall),

    NuraText(
      _hash,
      variant: NuraTextVariant.caption,
      mono: true,
      forceLtr: true,
      align: TextAlign.center,
    ),
    const SizedBox(height: NuraMetrics.gap),

    NuraButton(
      text: context.t('Dashboard.Send.Done'),
      variant: NuraButtonVariant.primary,
      size: NuraButtonSize.action,
      fullWidth: true,
      onPressed: () => Navigator.of(context).pop(),
    ),
  ];
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.mono = false});

  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        NuraText(label),
        const SizedBox(width: NuraMetrics.gap),
        Expanded(
          child: NuraText(
            value,
            variant: NuraTextVariant.captionStrong,
            mono: mono,
            forceLtr: mono,
            align: TextAlign.end,
            maxLines: 2,
          ),
        ),
      ],
    );
  }
}
