import 'package:flutter/material.dart';

import 'app.dart';
import 'application/session_controller.dart';
import 'application/settings_controller.dart';
import 'core/l10n/app_localizations.dart';
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

  final store = await AppStore.open();

  final settings = SettingsController(store);
  final session = SessionController(store);

  // Read before the first frame so no screen renders against a bundle that has not landed. See the
  // note in AppLocalizations: a delegate answering asynchronously blanks its subtree for a frame.
  await AppLocalizations.preload(settings.language);

  await session.restore();

  runApp(NuraApp(settings: settings, session: session));
}
