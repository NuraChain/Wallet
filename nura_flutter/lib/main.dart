import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'application/history_controller.dart';
import 'application/network_controller.dart';
import 'application/session_controller.dart';
import 'application/settings_controller.dart';
import 'application/token_controller.dart';
import 'core/l10n/app_localizations.dart';
import 'data/cache/history_cache.dart';
import 'data/storage/app_store.dart';

/// Starts the wallet.
///
/// Everything awaited here is awaited for a reason: the first frame must already know which language
/// to draw in, which palette to use, and whether a wallet exists. Deferring any of them would show
/// the wrong screen or the wrong language for a frame, and the wrong screen here is the create-a-
/// wallet flow shown to someone who already has one.
///
/// The store read is the only I/O, and it is small — one JSON file. If it were slow enough to matter
/// this would become a splash screen rather than a longer wait, but a few kilobytes is not.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Date symbols for every language the wallet ships. Without this, the first date formatted in any
  // locale but the default throws rather than falling back — and the wallet ships ten.
  await initializeDateFormatting();

  final store = await AppStore.open();

  final settings = SettingsController(store);
  final session = SessionController(store);
  final networks = NetworkController(store);
  final tokens = TokenController(store);
  final history = HistoryController(await HistoryCache.open());

  // Read before the first frame so no screen renders against a bundle that has not landed. See the
  // note in AppLocalizations: a delegate answering asynchronously blanks its subtree for a frame.
  await AppLocalizations.preload(settings.language);

  await session.restore();

  runApp(
    NuraApp(
      settings: settings,
      session: session,
      networks: networks,
      tokens: tokens,
      history: history,
    ),
  );
}
