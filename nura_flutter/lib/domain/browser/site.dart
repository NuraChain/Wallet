import 'package:flutter/foundation.dart';

/// Which layout the browser asks sites for.
///
/// Sniffing is done on the user agent, so this one value decides it on both platforms.
enum BrowserView {
  /// The default. The window is phone-shaped on Android and on Windows, and a desktop layout in a
  /// 360px column is the thing the default user agent already had to work around.
  mobile,
  desktop;

  static BrowserView resolve(String? stored) =>
      stored == 'desktop' ? BrowserView.desktop : BrowserView.mobile;

  String get stored => name;
}

/// One entry in the visited list: where it went and when it was last opened.
@immutable
class BrowserVisit {
  const BrowserVisit({required this.url, required this.time});

  final String url;
  final DateTime time;

  /// Reads one stored entry, or null when it is not one.
  ///
  /// A row missing either field is dropped rather than defaulted. A visit with no address is not a
  /// shortcut to anywhere, and one with no time cannot be ordered against the rest.
  static BrowserVisit? read(Object? raw) {
    if (raw is! Map<String, dynamic>) {
      return null;
    }

    final url = raw['url'];
    final time = raw['time'];

    if (url is! String || url.isEmpty || time is! num) {
      return null;
    }

    return BrowserVisit(
      url: url,
      time: DateTime.fromMillisecondsSinceEpoch(time.toInt()),
    );
  }

  /// The shape the Tauri build writes, so a wallet carrying its history still reads here.
  Map<String, dynamic> toJson() => <String, dynamic>{
    'url': url,
    'time': time.millisecondsSinceEpoch,
  };
}

/// A shortcut the user keeps.
///
/// The id is what edits and removals address rather than the URL: the URL is the field most likely
/// to be the one being changed, and a list keyed on the thing being edited loses track of the row
/// halfway through the edit.
@immutable
class BrowserFavorite {
  const BrowserFavorite({
    required this.id,
    required this.name,
    required this.url,
  });

  final String id;
  final String name;
  final String url;

  static BrowserFavorite? read(Object? raw) {
    if (raw is! Map<String, dynamic>) {
      return null;
    }

    final id = raw['id'];
    final name = raw['name'];
    final url = raw['url'];

    if (id is! String || name is! String || url is! String || url.isEmpty) {
      return null;
    }

    return BrowserFavorite(id: id, name: name, url: url);
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'name': name,
    'url': url,
  };

  BrowserFavorite copyWith({String? name, String? url}) =>
      BrowserFavorite(id: id, name: name ?? this.name, url: url ?? this.url);
}

/// The favourites a wallet starts with, in the order they are shown.
///
/// There is one shortcut list on the start screen and this is what fills it. A separate row of fixed
/// "suggestions" sat above it in an earlier design and said the same thing twice — a shortcut
/// someone can change and a shortcut someone cannot are not two categories worth two headings.
///
/// So these are seeded, not fixed: every one can be renamed, re-aimed or removed, and the stored
/// list is what is shown from then on. The names are written rather than translated, because they
/// name products rather than describe them.
///
/// The one shortcut not in this list is the active network's explorer, which cannot be: it has no
/// fixed address to store. It follows the chain and the account, and the start screen puts it at the
/// head of the same grid.
const List<BrowserFavorite> defaultFavorites = <BrowserFavorite>[
  BrowserFavorite(
    id: 'telegram',
    name: 'Telegram',
    url: 'https://t.me/nurachain',
  ),
  BrowserFavorite(id: 'google', name: 'Google', url: 'https://google.com'),
  BrowserFavorite(
    id: 'github',
    name: 'GitHub',
    url: 'https://github.com/NuraChain',
  ),
  BrowserFavorite(
    id: 'discord',
    name: 'Discord',
    url: 'https://discord.gg/ykW3PU64h9',
  ),
];

/// How many visits are kept.
///
/// Older than this and an entry stops being a shortcut and starts being a record of where someone
/// has been, which is not what the list is for.
const int historyLimit = 40;

/// Names a page by its host, since that is the part someone recognises.
///
/// `www.` is dropped for the same reason an address bar drops it, and anything that will not parse
/// falls back to the address as given rather than to nothing.
String siteHost(String url) {
  final parsed = Uri.tryParse(url);

  if (parsed == null || parsed.host.isEmpty) {
    return url;
  }

  return parsed.host.startsWith('www.')
      ? parsed.host.substring(4)
      : parsed.host;
}

/// Where a site's own icon lives.
///
/// Asked of the site itself rather than of an icon service. A service would answer for every host in
/// one round trip and with better artwork, but it would also be told every site in this list — one
/// party learning the browsing history of a wallet is exactly the trade this app does not make. The
/// site is contacted instead, and it is a host the user has already been to.
///
/// `/favicon.ico` is the path every browser falls back to, so it is the one that needs no page
/// parse. A site answering with something else simply fails to load, and the caller shows its
/// letter.
String siteIcon(String url) {
  final parsed = Uri.tryParse(url);

  if (parsed == null || parsed.host.isEmpty) {
    return '';
  }

  return parsed.resolve('/favicon.ico').toString();
}
