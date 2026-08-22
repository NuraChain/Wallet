import 'package:flutter/foundation.dart';

/// One open tab, and the whole of what the toolbar reads.
///
/// Everything the toolbar shows is per-tab, so it all lives here rather than beside the tab list:
/// [entries] and [index] are this tab's own back/forward stack, [draft] is what its address bar
/// holds, and [reload] is the ticket its view watches. [id] is assigned once and never reused, which
/// is what lets it name a webview and survive its neighbours being closed.
@immutable
class BrowserTab {
  const BrowserTab({
    required this.id,
    this.entries = const <String>[],
    this.index = -1,
    this.draft = '',
    this.reload = 0,
    this.home = false,
  });

  /// A tab holding one page already, for a link opened into a new tab.
  factory BrowserTab.at(int id, String url) =>
      BrowserTab(id: id, entries: <String>[url], index: 0, draft: url);

  final int id;

  /// Where this tab has been, oldest first.
  final List<String> entries;

  /// Which entry is on screen, or -1 for a tab that has never been given an address.
  final int index;

  /// What the address bar holds, which is not always what the page is.
  final String draft;

  /// Bumped to ask the view to load the current entry again.
  ///
  /// A counter rather than a flag, because a flag has to be cleared and the clearing is a second
  /// render the view can miss. Anything watching this only has to notice that it changed.
  final int reload;

  /// The start screen shown *over* a tab that still has a page.
  ///
  /// Separate from having no address, because the page underneath is kept alive and returned to.
  /// Going home used to clear the stack, which discarded the view and made the trip one-way.
  final bool home;

  /// Whether this tab shows the start screen rather than a page.
  ///
  /// True either because the tab has never been given an address or because it was sent home. The
  /// view and the tab strip both read this and have to agree: the strip belongs to the start screen,
  /// so it is on screen exactly when the start screen is.
  bool get atStart => home || index < 0;

  /// The address on screen, or null at the start screen.
  String? get url =>
      index >= 0 && index < entries.length ? entries[index] : null;

  /// Whether the stack has somewhere to go.
  ///
  /// Derived from this tab's own record of where it has been. A webview keeps its own history and is
  /// expected to agree; where it does not — a page that redirected, a fragment it counted and this
  /// did not — the view's answer is the one to trust, because it is the one that will actually be
  /// obeyed.
  bool get canBack => index > 0;

  bool get canForward => index >= 0 && index < entries.length - 1;

  /// Navigates to [url], dropping anything that was ahead.
  ///
  /// Going somewhere new from the middle of the stack discards the forward entries, which is what
  /// every browser does: the path not taken stops being reachable the moment another one is.
  BrowserTab visit(String url) {
    final next = <String>[...entries.take(index + 1), url];

    return copyWith(
      entries: next,
      index: next.length - 1,
      draft: url,
      home: false,
    );
  }

  /// Moves [delta] entries through the stack, or returns this tab unchanged.
  ///
  /// Refuses rather than clamps. A back button that quietly does nothing at the end of the stack is
  /// correct; one that lands on the wrong page because the step was clamped is not.
  BrowserTab step(int delta) {
    final next = index + delta;

    if (index < 0 || next < 0 || next >= entries.length) {
      return this;
    }

    return copyWith(index: next, draft: entries[next], home: false);
  }

  /// Shows the start screen without giving up the page underneath.
  BrowserTab goHome() => copyWith(draft: '', home: true);

  /// Asks the view to load the current entry again.
  BrowserTab reloaded() => copyWith(reload: reload + 1);

  BrowserTab withDraft(String text) => copyWith(draft: text);

  BrowserTab copyWith({
    List<String>? entries,
    int? index,
    String? draft,
    int? reload,
    bool? home,
  }) {
    return BrowserTab(
      id: id,
      entries: entries ?? this.entries,
      index: index ?? this.index,
      draft: draft ?? this.draft,
      reload: reload ?? this.reload,
      home: home ?? this.home,
    );
  }
}
