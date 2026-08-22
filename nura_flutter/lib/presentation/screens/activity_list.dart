import 'package:flutter/material.dart';

import '../../application/history_controller.dart';
import '../../core/format.dart';
import '../../core/l10n/app_localizations.dart';
import '../../data/repositories/history_repository.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_field.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_surface.dart';
import '../widgets/nura_text.dart';

/// How many transactions the wallet tab shows before sending the user to the overview.
const int _preview = 5;

/// The recent transfers, under the token list.
///
/// Holdings and the movements that produced them read as one column. Only the most recent handful
/// are shown: the wallet tab is a glance, and the overview beside the heading holds the full,
/// searchable list.
class ActivityList extends StatelessWidget {
  const ActivityList({
    super.key,
    required this.history,
    required this.address,
    this.onOpen,
  });

  final HistoryController history;
  final String address;

  /// Opens one transaction on the explorer, or null when this network has none to open.
  final void Function(String hash)? onOpen;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: history,
      builder: (context, _) {
        final entries = history.entries;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            SectionHeader(
              title: context.t('Dashboard.Activity.Title'),
              trailing: NuraButton(
                variant: NuraButtonVariant.chip,
                text: context.t('Dashboard.Activity.Overview'),
                leading: const Icon(Icons.list, size: 14),
                onPressed: () => NuraModal.show<void>(
                  context,
                  builder: (sheet) => HistoryOverview(
                    history: history,
                    address: address,
                    onOpen: onOpen,
                  ),
                ),
              ),
            ),
            const SizedBox(height: NuraMetrics.gapSmall),

            for (final entry in entries.take(_preview)) ...<Widget>[
              TransactionRow(entry: entry, address: address, onOpen: onOpen),
              const SizedBox(height: NuraMetrics.gapSmall),
            ],

            if (history.isLoading && entries.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: NuraMetrics.gap),
                child: NuraText(
                  context.t('Dashboard.Activity.Loading'),
                  align: TextAlign.center,
                ),
              )
            else if (entries.isEmpty)
              EmptyState(panel: true, text: emptyText(context, history)),
          ],
        );
      },
    );
  }
}

/// What an empty list means, in the order the answers rank.
///
/// Offline comes first because it is the only one of the three that can be established: with nothing
/// reached, neither the account's emptiness nor the explorer's refusal has been shown. An empty list,
/// an unreadable one and an unasked one look identical, and only one of them is the user's doing.
///
/// The explorer's own sentence is not printed. It is English marketing copy from a third party — "Max
/// rate limit reached, please use API key for higher rate limit" — and nothing the user can act on
/// from a wallet. It stays the ordinary empty state rather than an error panel, too: a network whose
/// explorer will never answer without a paid plan is a standing condition, not something breaking.
String emptyText(BuildContext context, HistoryController history) {
  if (history.isOffline) {
    return context.t('Dashboard.Activity.Offline');
  }

  return context.t(
    history.notice.isNotEmpty
        ? 'Dashboard.Activity.Unavailable'
        : 'Dashboard.Activity.Empty',
  );
}

/// One transaction as a tappable row.
///
/// Direction icon in a muted box, the counterparty under the verb, signed amount and date on the end.
/// The wallet tab's preview and the full overview render this same row, so the two lists cannot drift
/// apart.
class TransactionRow extends StatelessWidget {
  const TransactionRow({
    super.key,
    required this.entry,
    required this.address,
    this.onOpen,
  });

  final HistoryEntry entry;
  final String address;
  final void Function(String hash)? onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final incoming = entry.receivedBy(address);

    final counterparty = incoming ? entry.from : entry.to;

    return NuraButton(
      variant: NuraButtonVariant.bare,
      padding: EdgeInsets.zero,
      semanticLabel: context.t('Dashboard.Activity.Open'),
      // Disabled rather than hidden when the network has no explorer: a row that quietly stops being
      // tappable on one chain reads as a broken row, not as a missing explorer.
      onPressed: onOpen == null ? null : () => onOpen!(entry.hash),
      child: GlassPanel(
        radius: NuraMetrics.radiusMedium,
        // No blur, for the same reason the token rows have none: a backdrop filter per row is what
        // costs frames on a list that scrolls.
        blur: false,
        padding: const EdgeInsets.all(NuraMetrics.gap),
        child: Row(
          children: <Widget>[
            IconBox(
              child: Icon(
                incoming ? Icons.south_west : Icons.north_east,
                size: 18,
                color: colors.txtMuted,
              ),
            ),
            const SizedBox(width: NuraMetrics.gapSmall),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  NuraText(
                    context.t(
                      incoming
                          ? 'Dashboard.Activity.Received'
                          : 'Dashboard.Activity.Sent',
                    ),
                    variant: NuraTextVariant.captionStrong,
                    maxLines: 1,
                  ),
                  NuraText(
                    shortAddress(counterparty),
                    mono: true,
                    forceLtr: true,
                    maxLines: 1,
                  ),
                ],
              ),
            ),
            const SizedBox(width: NuraMetrics.gapSmall),

            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                // The sign is already there, but on a list of near-identical rows the colour is what
                // the eye picks up before it reads anything.
                NuraText(
                  '${incoming ? '+' : '-'}'
                  '${formatUnits(entry.value, entry.decimals)} ${entry.symbol}',
                  variant: NuraTextVariant.captionStrong,
                  color: incoming ? colors.txtSuccess : colors.txtError,
                  mono: true,
                  forceLtr: true,
                  maxLines: 1,
                ),
                NuraText(formatDate(entry.at, context.language), maxLines: 1),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Which direction the overview is filtered to.
enum HistoryFilter { all, sent, received }

/// The complete history, with search and filtering.
///
/// The wallet tab only has room for the last handful, so this is where the full list lives. Search
/// matches the hash, either party's address and the asset symbol at once, because someone hunting a
/// transfer usually remembers only one of the three.
class HistoryOverview extends StatefulWidget {
  const HistoryOverview({
    super.key,
    required this.history,
    required this.address,
    this.onOpen,
  });

  final HistoryController history;
  final String address;
  final void Function(String hash)? onOpen;

  @override
  State<HistoryOverview> createState() => _HistoryOverviewState();
}

class _HistoryOverviewState extends State<HistoryOverview> {
  /// How many rows are drawn to begin with, and how many more each time the end is reached.
  ///
  /// The transactions are all in memory already — the explorer hands over a page of fifty at once —
  /// so this is about what is rendered rather than what is fetched.
  static const int _step = 10;

  final TextEditingController _query = TextEditingController();
  final ScrollController _scroll = ScrollController();

  HistoryFilter _filter = HistoryFilter.all;

  int _shown = _step;

  @override
  void initState() {
    super.initState();

    _scroll.addListener(_grow);
  }

  @override
  void dispose() {
    _scroll.dispose();
    _query.dispose();

    super.dispose();
  }

  void _grow() {
    if (_scroll.position.extentAfter < 200 && _shown < _matches.length) {
      setState(() => _shown += _step);
    }
  }

  /// The rows the search and the filter leave.
  List<HistoryEntry> get _matches {
    final needle = _query.text.trim().toLowerCase();

    return widget.history.entries.where((entry) {
      final incoming = entry.receivedBy(widget.address);

      final directionMatches = switch (_filter) {
        HistoryFilter.all => true,
        HistoryFilter.sent => !incoming,
        HistoryFilter.received => incoming,
      };

      if (!directionMatches) {
        return false;
      }

      return needle.isEmpty ||
          entry.hash.toLowerCase().contains(needle) ||
          entry.from.toLowerCase().contains(needle) ||
          entry.to.toLowerCase().contains(needle) ||
          entry.symbol.toLowerCase().contains(needle);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.history,
      builder: (context, _) {
        final matches = _matches;
        final drawn = matches.take(_shown).toList();

        return NuraModal(
          onClose: () => Navigator.of(context).pop(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              NuraModalHeader(
                title: context.t('Dashboard.Activity.Title'),
                onClose: () => Navigator.of(context).pop(),
              ),
              const SizedBox(height: NuraMetrics.gap),

              NuraTextField(
                controller: _query,
                hint: context.t('Dashboard.Activity.Search'),
                leading: Icon(
                  Icons.search,
                  size: 16,
                  color: context.colors.txtMuted,
                ),
                // The list is rebuilt as the query changes, and the window shrinks back with it —
                // otherwise a search after scrolling deep would draw every match at once.
                onChanged: (_) => setState(() => _shown = _step),
              ),
              const SizedBox(height: NuraMetrics.gapSmall),

              Row(
                children: <Widget>[
                  for (final filter in HistoryFilter.values) ...<Widget>[
                    Expanded(
                      child: NuraButton(
                        text: context.t(switch (filter) {
                          HistoryFilter.all => 'Dashboard.Activity.FilterAll',
                          HistoryFilter.sent => 'Dashboard.Activity.FilterSent',
                          HistoryFilter.received =>
                            'Dashboard.Activity.FilterReceived',
                        }),
                        variant: filter == _filter
                            ? NuraButtonVariant.primary
                            : NuraButtonVariant.muted,
                        onPressed: () => setState(() {
                          _filter = filter;
                          _shown = _step;
                        }),
                      ),
                    ),
                    if (filter != HistoryFilter.values.last)
                      const SizedBox(width: NuraMetrics.gapTight),
                  ],
                ],
              ),
              const SizedBox(height: NuraMetrics.gapSmall),

              NuraText(
                context.t('Dashboard.Activity.Count', <Object?>[
                  '${matches.length}',
                ]),
              ),
              const SizedBox(height: NuraMetrics.gapSmall),

              Flexible(
                child: drawn.isEmpty
                    ? EmptyState(
                        panel: true,
                        text: widget.history.entries.isEmpty
                            ? emptyText(context, widget.history)
                            : context.t('Dashboard.Activity.NoMatch'),
                      )
                    : ListView.separated(
                        controller: _scroll,
                        shrinkWrap: true,
                        itemCount: drawn.length,
                        separatorBuilder: (_, _) =>
                            const SizedBox(height: NuraMetrics.gapSmall),
                        itemBuilder: (context, index) => TransactionRow(
                          entry: drawn[index],
                          address: widget.address,
                          onOpen: widget.onOpen,
                        ),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}
