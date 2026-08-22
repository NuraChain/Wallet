import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app.dart';
import '../../application/balance_controller.dart';
import '../../core/l10n/app_localizations.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_surface.dart';
import '../widgets/nura_text.dart';

/// The three tabs, in the order the Tauri build shows them.
enum DashboardTab { wallet, browser, apps }

/// The unlocked wallet.
///
/// Three tabs behind a bottom bar. The Tauri build mounted all three at once because Swiper does,
/// and paid for it by building the browser during the dashboard's first render; here they are built
/// on demand and kept alive afterwards, which gets the same instant switching without the cost on
/// first paint.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final BalanceController _balance = BalanceController();

  DashboardTab _tab = DashboardTab.wallet;

  String? _loadedFor;

  @override
  void dispose() {
    _balance.dispose();

    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    _refreshIfAccountChanged();
  }

  /// Loads the balance when the account or chain actually changes.
  ///
  /// Keyed on address *and* chain because both change what the number means. Without the key this
  /// would re-read on every rebuild, which on a screen that rebuilds for theme, language and tab
  /// changes would be a request per interaction.
  void _refreshIfAccountChanged() {
    final session = SessionScope.of(context);
    final networks = NetworkScope.of(context);

    final address = session.address;

    if (address == null) {
      return;
    }

    final key = '$address@${networks.active.id}';

    if (key == _loadedFor) {
      return;
    }

    _loadedFor = key;

    _balance.clear();

    // Scheduled off the build. `didChangeDependencies` runs during build, and notifying a listener
    // from inside one is what produces "setState called during build".
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _balance.load(networks.active, networks.client, address);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(
          index: _tab.index,
          children: <Widget>[
            _WalletTab(balance: _balance),
            const _NotMigrated(name: 'Browser'),
            const _NotMigrated(name: 'Apps'),
          ],
        ),
      ),
      bottomNavigationBar: _NavBar(
        active: _tab,
        onSelect: (tab) => setState(() => _tab = tab),
      ),
    );
  }
}

class _NavBar extends StatelessWidget {
  const _NavBar({required this.active, required this.onSelect});

  final DashboardTab active;
  final ValueChanged<DashboardTab> onSelect;

  static const Map<DashboardTab, ({IconData icon, String label})> _items =
      <DashboardTab, ({IconData icon, String label})>{
        DashboardTab.wallet: (
          icon: Icons.account_balance_wallet_outlined,
          label: 'Dashboard.Nav.Wallet',
        ),
        DashboardTab.browser: (
          icon: Icons.public,
          label: 'Dashboard.Nav.Browser',
        ),
        DashboardTab.apps: (icon: Icons.grid_view, label: 'Dashboard.Nav.Apps'),
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return GlassPanel(
      radius: 0,
      shadow: false,
      padding: EdgeInsets.only(
        top: NuraMetrics.gapSmall,
        // Clears the Android gesture bar without hard-coding a height for it.
        bottom: NuraMetrics.gapSmall + MediaQuery.paddingOf(context).bottom,
      ),
      child: Row(
        children: <Widget>[
          for (final entry in _items.entries)
            Expanded(
              child: NuraButton(
                variant: NuraButtonVariant.bare,
                semanticLabel: context.t(entry.value.label),
                onPressed: () => onSelect(entry.key),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(
                      entry.value.icon,
                      size: 20,
                      color: entry.key == active
                          ? colors.btnPrimary
                          : colors.txtMuted,
                    ),
                    const SizedBox(height: 2),
                    NuraText(
                      context.t(entry.value.label),
                      color: entry.key == active
                          ? colors.btnPrimary
                          : colors.txtMuted,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _WalletTab extends StatelessWidget {
  const _WalletTab({required this.balance});

  final BalanceController balance;

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final networks = NetworkScope.of(context);

    final address = session.address ?? '';

    return ListView(
      padding: const EdgeInsets.all(NuraMetrics.gapLarge),
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              child: NuraButton(
                variant: NuraButtonVariant.chip,
                onPressed: () => _pickNetwork(context),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(
                      Icons.lan_outlined,
                      size: 14,
                      color: context.colors.txtMuted,
                    ),
                    const SizedBox(width: NuraMetrics.gapTight),
                    Flexible(
                      child: NuraText(
                        networks.active.name,
                        variant: NuraTextVariant.captionStrong,
                        maxLines: 1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: NuraMetrics.gapSmall),
            NuraButton(
              variant: NuraButtonVariant.chip,
              size: NuraButtonSize.iconChip,
              semanticLabel: context.t('Dashboard.Lock'),
              onPressed: session.lock,
              child: const Icon(Icons.lock_outline, size: 16),
            ),
          ],
        ),
        const SizedBox(height: NuraMetrics.gapLarge),

        GlassPanel(
          radius: NuraMetrics.radiusPanel,
          padding: const EdgeInsets.all(NuraMetrics.gapLarge),
          child: Column(
            children: <Widget>[
              _AddressRow(address: address),
              const SizedBox(height: NuraMetrics.gapLarge),
              _BalanceView(balance: balance, symbol: networks.active.symbol),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _pickNetwork(BuildContext context) async {
    final networks = NetworkScope.of(context);

    await NuraModal.show<void>(
      context,
      builder: (sheet) => NuraModal(
        scroll: true,
        onClose: () => Navigator.of(sheet).pop(),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            NuraModalHeader(
              title: sheet.t('Dashboard.Network.Title'),
              onClose: () => Navigator.of(sheet).pop(),
            ),
            const SizedBox(height: NuraMetrics.gap),
            for (final network in networks.all) ...<Widget>[
              NuraButton(
                text: network.name,
                variant: network.id == networks.active.id
                    ? NuraButtonVariant.primary
                    : NuraButtonVariant.muted,
                size: NuraButtonSize.action,
                fullWidth: true,
                onPressed: () {
                  networks.select(network.id);

                  Navigator.of(sheet).pop();
                },
              ),
              const SizedBox(height: NuraMetrics.gapSmall),
            ],
          ],
        ),
      ),
    );
  }
}

class _AddressRow extends StatelessWidget {
  const _AddressRow({required this.address});

  final String address;

  /// `0x1234…abcd`, the form the Tauri build shows.
  String get _short => address.length <= 12
      ? address
      : '${address.substring(0, 6)}…${address.substring(address.length - 4)}';

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: <Widget>[
        // Pinned left-to-right: an address is not language, and reversed inside a Persian screen
        // its `0x` prefix ends up on the wrong end.
        NuraText(
          _short,
          variant: NuraTextVariant.captionStrong,
          mono: true,
          forceLtr: true,
        ),
        const SizedBox(width: NuraMetrics.gapSmall),
        NuraButton(
          variant: NuraButtonVariant.bare,
          semanticLabel: context.t('Dashboard.Copy'),
          onPressed: () => _copy(context),
          child: Icon(Icons.copy, size: 14, color: context.colors.txtMuted),
        ),
      ],
    );
  }

  Future<void> _copy(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final copied = context.t('Dashboard.Copied');
    final failed = context.t('Dashboard.CopyFailed');

    try {
      // The full address, never the shortened form — pasting `0x1234…abcd` somewhere would send
      // funds nowhere, and the ellipsis is easy to miss.
      await Clipboard.setData(ClipboardData(text: address));

      messenger.showSnackBar(SnackBar(content: Text(copied)));
    } on Object {
      messenger.showSnackBar(SnackBar(content: Text(failed)));
    }
  }
}

class _BalanceView extends StatelessWidget {
  const _BalanceView({required this.balance, required this.symbol});

  final BalanceController balance;
  final String symbol;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: balance,
      builder: (context, _) {
        final reading = balance.reading;

        return Column(
          children: <Widget>[
            if (reading != null)
              NuraText(
                '${reading.display()} $symbol',
                variant: NuraTextVariant.display,
                align: TextAlign.center,
                maxLines: 1,
              )
            else if (balance.isLoading)
              const NuraSpinner(size: 28)
            else
              NuraText(
                '— $symbol',
                variant: NuraTextVariant.display,
                align: TextAlign.center,
              ),

            // The failure is shown *under* a figure that is still on screen rather than replacing
            // it: a stale-but-true balance beats no balance, as long as it says it is stale.
            if (balance.status == BalanceStatus.unreachable) ...<Widget>[
              const SizedBox(height: NuraMetrics.gapSmall),
              NuraText(
                context.t('Dashboard.Offline.Failed'),
                align: TextAlign.center,
              ),
            ] else if (balance.status == BalanceStatus.failed) ...<Widget>[
              const SizedBox(height: NuraMetrics.gapSmall),
              NuraText(balance.failure, align: TextAlign.center, maxLines: 2),
            ],
          ],
        );
      },
    );
  }
}

/// A tab that is not migrated yet, named so nobody mistakes it for a finished screen.
class _NotMigrated extends StatelessWidget {
  const _NotMigrated({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: EmptyState(text: 'The $name tab is not migrated yet.'),
    );
  }
}
