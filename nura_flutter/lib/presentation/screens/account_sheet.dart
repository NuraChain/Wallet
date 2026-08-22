import 'package:flutter/material.dart';

import '../../application/session_controller.dart';
import '../../core/format.dart';
import '../../core/l10n/app_localizations.dart';
import '../../domain/wallet/account.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_alert.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_field.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_surface.dart';
import '../widgets/nura_text.dart';

/// The badges an account can wear.
///
/// A fixed palette rather than a free text field: a keyboard's emoji picker is not reachable on
/// every platform this ships to, and one tap beats typing. Chosen to stay distinguishable at disc
/// size and to avoid anything that renders as a flat box on an older Android font.
const List<String> accountBadges = <String>[
  '🦊', '🐺', '🐱', '🐼', '🦁', '🐸', '🐙', '🦄', //
  '🚀', '⭐', '🔥', '💎', '🌙', '⚡', '🍀', '🌈',
  '🎯', '👑', '🔑', '🏦', '💼', '🧊', '🍉', '🎲',
];

/// The label an account shows when the user has not given it one.
String defaultAccountName(BuildContext context, int index) =>
    '${context.t('Dashboard.Account')} ${index + 1}';

/// Account switcher: pick which derived account the dashboard is looking at, label them, add more.
///
/// Every account is a derivation index on the one recovery phrase, so adding one needs no new key
/// material — index 0 comes with the wallet and is always present, and any further index is derived
/// on the spot.
///
/// A wallet imported from a private key is the exception: it holds one key, no index yields another,
/// so it gets the same list with the add form withheld and a line saying why. Renaming and badges
/// still work — those are labels on an account, not new key material.
class AccountSheet extends StatefulWidget {
  const AccountSheet({super.key, required this.session});

  final SessionController session;

  @override
  State<AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<AccountSheet> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _index = TextEditingController();

  /// Which account is being renamed, being badged, or -1 for neither.
  int _editing = -1;
  int _picking = -1;

  bool _adding = false;
  String _error = '';

  @override
  void dispose() {
    _name.dispose();
    _index.dispose();

    super.dispose();
  }

  /// The typed index, or null when it is not a usable one.
  ///
  /// The range starts at one rather than zero: index 0 is created with the wallet and is always in
  /// the list, so it is the one index that can never be added. Offering it only ever produced the
  /// "already in your list" error.
  int? get _typedIndex {
    final parsed = int.tryParse(_index.text.trim());

    return parsed != null && parsed >= Account.first && parsed < Account.limit
        ? parsed
        : null;
  }

  void _startRename(int index, String current) {
    setState(() {
      _picking = -1;
      _editing = index;
      _name.text = current;
    });
  }

  Future<void> _saveName() async {
    final index = _editing;

    setState(() => _editing = -1);

    await widget.session.renameAccount(index, _name.text);
  }

  Future<void> _create() async {
    final index = _typedIndex;

    if (index == null) {
      setState(
        () => _error = context.t('Dashboard.Accounts.ErrorIndex', <Object?>[
          '${Account.first}',
          '${Account.limit - 1}',
        ]),
      );

      return;
    }

    if (widget.session.accounts.any((a) => a.index == index)) {
      setState(() => _error = context.t('Dashboard.Accounts.ErrorExists'));

      return;
    }

    // Selecting an index the wallet has never opened is what creates it, so adding and switching to
    // the new account are the same call.
    await widget.session.selectAccount(index);

    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.session,
      builder: (context, _) => NuraModal(
        scroll: true,
        onClose: () => Navigator.of(context).pop(),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            NuraModalHeader(
              title: context.t('Dashboard.Accounts.Title'),
              subtitle: context.t('Dashboard.Accounts.Subtitle'),
              onClose: () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: NuraMetrics.gap),

            if (_adding) ..._addForm(context) else ..._list(context),
          ],
        ),
      ),
    );
  }

  List<Widget> _addForm(BuildContext context) {
    final index = _typedIndex;

    // Derived as the index is typed, so the user can confirm which account they are about to add
    // before it exists — which matters when the index is the only thing identifying it.
    final preview = index == null
        ? null
        : widget.session.addressOfAccount(index);

    return <Widget>[
      if (_error.isNotEmpty) ...<Widget>[
        NuraAlert(text: _error),
        const SizedBox(height: NuraMetrics.gapSmall),
      ],

      NuraTextField(
        controller: _index,
        autofocus: true,
        label: context.t('Dashboard.Accounts.Index'),
        hint: context.t('Dashboard.Accounts.IndexHint'),
        keyboardType: TextInputType.number,
        textDirection: TextDirection.ltr,
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _create(),
      ),
      const SizedBox(height: NuraMetrics.gapSmall),

      NuraText(context.t('Dashboard.Accounts.IndexNote')),

      if (preview != null) ...<Widget>[
        const SizedBox(height: NuraMetrics.gapSmall),
        // The full address, not a shortened one. This is the whole point of the preview — a user
        // confirming which account an index yields has to be able to read every character.
        GlassPanel(
          radius: NuraMetrics.radiusMedium,
          blur: false,
          shadow: false,
          padding: const EdgeInsets.all(NuraMetrics.gap),
          child: NuraText(
            preview,
            variant: NuraTextVariant.captionStrong,
            mono: true,
            forceLtr: true,
            align: TextAlign.center,
          ),
        ),
      ],
      const SizedBox(height: NuraMetrics.gap),

      Row(
        children: <Widget>[
          Expanded(
            child: NuraButton(
              text: context.t('Dashboard.Accounts.Back'),
              variant: NuraButtonVariant.muted,
              size: NuraButtonSize.action,
              onPressed: () => setState(() {
                _adding = false;
                _error = '';
              }),
            ),
          ),
          const SizedBox(width: NuraMetrics.gapSmall),
          Expanded(
            child: NuraButton(
              text: context.t('Dashboard.Accounts.Create'),
              variant: NuraButtonVariant.primary,
              size: NuraButtonSize.action,
              onPressed: _create,
            ),
          ),
        ],
      ),
    ];
  }

  List<Widget> _list(BuildContext context) {
    final session = widget.session;

    return <Widget>[
      for (final account in session.accounts) ...<Widget>[
        if (_picking == account.index)
          _BadgePicker(
            onPick: (emoji) async {
              setState(() => _picking = -1);

              await session.badgeAccount(account.index, emoji);
            },
          )
        else if (_editing == account.index)
          Row(
            children: <Widget>[
              Expanded(
                child: NuraTextField(
                  controller: _name,
                  autofocus: true,
                  hint: defaultAccountName(context, account.index),
                  onSubmitted: (_) => _saveName(),
                ),
              ),
              const SizedBox(width: NuraMetrics.gapSmall),
              NuraButton(
                text: context.t('Dashboard.Accounts.Save'),
                variant: NuraButtonVariant.primary,
                onPressed: _saveName,
              ),
            ],
          )
        else
          _AccountRow(
            account: account,
            address: session.addressOfAccount(account.index) ?? '',
            active: account.index == session.account,
            onSelect: () async {
              await session.selectAccount(account.index);

              if (context.mounted) {
                Navigator.of(context).pop();
              }
            },
            onBadge: () => setState(() {
              _editing = -1;
              _picking = account.index;
            }),
            onRename: () => _startRename(
              account.index,
              account.name.isEmpty
                  ? defaultAccountName(context, account.index)
                  : account.name,
            ),
          ),
        const SizedBox(height: NuraMetrics.gapSmall),
      ],

      // A private key is one account and no index derives another, so the add form is withheld
      // rather than shown and then refused — and the line replacing it says why, since an absent
      // button explains nothing on its own.
      if (session.derivable)
        NuraButton(
          text: context.t('Dashboard.Accounts.Add'),
          variant: NuraButtonVariant.normal,
          size: NuraButtonSize.action,
          fullWidth: true,
          leading: const Icon(Icons.add, size: 16),
          onPressed: () => setState(() {
            _adding = true;
            _error = '';
            _index.clear();
          }),
        )
      else
        NuraText(
          context.t('Dashboard.Accounts.SingleNote'),
          align: TextAlign.center,
        ),
    ];
  }
}

class _AccountRow extends StatelessWidget {
  const _AccountRow({
    required this.account,
    required this.address,
    required this.active,
    required this.onSelect,
    required this.onBadge,
    required this.onRename,
  });

  final Account account;
  final String address;
  final bool active;
  final VoidCallback onSelect;
  final VoidCallback onBadge;
  final VoidCallback onRename;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    final label = account.name.isEmpty
        ? defaultAccountName(context, account.index)
        : account.name;

    return Container(
      padding: const EdgeInsets.all(NuraMetrics.gapSmall),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(NuraMetrics.radiusMedium),
        // The row's tint is what says which account is active; the badge tile deliberately does not
        // change with it, because a branded fill under an emoji only fights the emoji.
        color: active ? colors.btnPrimary.withValues(alpha: 0.15) : null,
      ),
      child: Row(
        children: <Widget>[
          // Its own control, so tapping the disc opens the badge picker. That is also why it cannot
          // sit inside the select button — a button inside a button has no sensible hit target.
          NuraButton(
            variant: NuraButtonVariant.bare,
            padding: EdgeInsets.zero,
            semanticLabel: context.t('Dashboard.Accounts.Emoji'),
            onPressed: onBadge,
            child: IconBox(
              tone: IconBoxTone.badge,
              child: NuraText(
                account.hasBadge ? account.emoji! : '${account.index}',
                // An emoji needs the extra step to read at disc size; a bare index does not.
                variant: account.hasBadge
                    ? NuraTextVariant.body
                    : NuraTextVariant.captionStrong,
              ),
            ),
          ),
          const SizedBox(width: NuraMetrics.gapSmall),

          Expanded(
            child: NuraButton(
              variant: NuraButtonVariant.bare,
              padding: EdgeInsets.zero,
              onPressed: onSelect,
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        NuraText(
                          label,
                          variant: NuraTextVariant.captionStrong,
                          maxLines: 1,
                        ),
                        // Pinned left-to-right on the text itself rather than on the column: on the
                        // column it would also flip the alignment under Persian, leaving the address
                        // hanging under a right-aligned name.
                        NuraText(
                          shortAddress(address),
                          mono: true,
                          forceLtr: true,
                          maxLines: 1,
                        ),
                      ],
                    ),
                  ),
                  if (active)
                    Icon(Icons.check, size: 18, color: colors.txtNormal),
                ],
              ),
            ),
          ),
          const SizedBox(width: NuraMetrics.gapTight),

          NuraButton(
            variant: NuraButtonVariant.muted,
            size: NuraButtonSize.iconChip,
            semanticLabel: context.t('Dashboard.Accounts.Rename'),
            onPressed: onRename,
            child: const Icon(Icons.edit_outlined, size: 14),
          ),
        ],
      ),
    );
  }
}

class _BadgePicker extends StatelessWidget {
  const _BadgePicker({required this.onPick});

  /// Null clears the badge, which drops the field rather than storing a blank.
  final void Function(String? emoji) onPick;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        NuraText(context.t('Dashboard.Accounts.Emoji')),
        const SizedBox(height: NuraMetrics.gapSmall),

        GridView.count(
          crossAxisCount: 8,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: NuraMetrics.gapTight,
          crossAxisSpacing: NuraMetrics.gapTight,
          children: <Widget>[
            for (final emoji in accountBadges)
              NuraButton(
                variant: NuraButtonVariant.muted,
                padding: EdgeInsets.zero,
                onPressed: () => onPick(emoji),
                child: NuraText(emoji, variant: NuraTextVariant.body),
              ),
          ],
        ),
        const SizedBox(height: NuraMetrics.gapSmall),

        NuraButton(
          text: context.t('Dashboard.Accounts.EmojiClear'),
          variant: NuraButtonVariant.normal,
          size: NuraButtonSize.action,
          fullWidth: true,
          onPressed: () => onPick(null),
        ),
      ],
    );
  }
}

/// The header chip that names the account in view and opens the switcher.
class AccountChip extends StatelessWidget {
  const AccountChip({super.key, required this.session});

  final SessionController session;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: session,
      builder: (context, _) {
        final account = session.accounts
            .where((a) => a.index == session.account)
            .firstOrNull;

        final label = account == null || account.name.isEmpty
            ? defaultAccountName(context, session.account)
            : account.name;

        return NuraButton(
          variant: NuraButtonVariant.chip,
          onPressed: () => NuraModal.show<void>(
            context,
            builder: (sheet) => AccountSheet(session: session),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              if (account != null && account.hasBadge)
                NuraText(account.emoji!)
              else
                Icon(
                  Icons.person_outline,
                  size: 14,
                  color: context.colors.txtMuted,
                ),
              const SizedBox(width: NuraMetrics.gapTight),
              Flexible(
                child: NuraText(
                  label,
                  variant: NuraTextVariant.captionStrong,
                  maxLines: 1,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
