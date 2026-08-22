import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'application/history_controller.dart';
import 'application/network_controller.dart';
import 'application/session_controller.dart';
import 'application/token_controller.dart';
import 'application/settings_controller.dart';
import 'core/l10n/app_localizations.dart';
import 'presentation/screens/dashboard_screen.dart';
import 'presentation/screens/intro_screen.dart';
import 'presentation/screens/unlock_screen.dart';
import 'presentation/theme/app_theme.dart';

/// Hands the two controllers down the tree.
///
/// An [InheritedNotifier] pair rather than a package: the tree needs exactly two long-lived objects,
/// both already [ChangeNotifier]s, and this is the mechanism Flutter provides for that. A dependency
/// would buy scoping and overrides that an app with two controllers has no use for.
///
/// Two separate scopes rather than one holding both, deliberately. A widget that only reads the
/// language should not rebuild when the wallet locks, and `dependOnInheritedWidgetOfExactType` is
/// what makes that distinction — one combined scope would rebuild everything on either change.
class SettingsScope extends InheritedNotifier<SettingsController> {
  const SettingsScope({
    super.key,
    required SettingsController super.notifier,
    required super.child,
  });

  static SettingsController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<SettingsScope>();

    assert(scope != null, 'SettingsScope is missing from the tree');

    return scope!.notifier!;
  }
}

class SessionScope extends InheritedNotifier<SessionController> {
  const SessionScope({
    super.key,
    required SessionController super.notifier,
    required super.child,
  });

  static SessionController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<SessionScope>();

    assert(scope != null, 'SessionScope is missing from the tree');

    return scope!.notifier!;
  }
}

class NetworkScope extends InheritedNotifier<NetworkController> {
  const NetworkScope({
    super.key,
    required NetworkController super.notifier,
    required super.child,
  });

  static NetworkController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<NetworkScope>();

    assert(scope != null, 'NetworkScope is missing from the tree');

    return scope!.notifier!;
  }
}

class HistoryScope extends InheritedNotifier<HistoryController> {
  const HistoryScope({
    super.key,
    required HistoryController super.notifier,
    required super.child,
  });

  static HistoryController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<HistoryScope>();

    assert(scope != null, 'HistoryScope is missing from the tree');

    return scope!.notifier!;
  }
}

class TokenScope extends InheritedNotifier<TokenController> {
  const TokenScope({
    super.key,
    required TokenController super.notifier,
    required super.child,
  });

  static TokenController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<TokenScope>();

    assert(scope != null, 'TokenScope is missing from the tree');

    return scope!.notifier!;
  }
}

/// The application.
///
/// There is no router. The Tauri build used one because the web needs URLs, and it then had to
/// defend every route with a guard that redirected before rendering. What the app actually has is
/// three mutually exclusive states — no wallet, locked, open — so it is modelled as a state and the
/// shell renders whichever screen matches. A route that should not be reachable then does not exist
/// to be reached, rather than existing and being guarded.
class NuraApp extends StatelessWidget {
  const NuraApp({
    super.key,
    required this.settings,
    required this.session,
    required this.networks,
    required this.tokens,
    required this.history,
  });

  final SettingsController settings;
  final SessionController session;
  final NetworkController networks;
  final TokenController tokens;
  final HistoryController history;

  @override
  Widget build(BuildContext context) {
    return SettingsScope(
      notifier: settings,
      child: SessionScope(
        notifier: session,
        child: NetworkScope(
          notifier: networks,
          child: TokenScope(
            notifier: tokens,
            child: HistoryScope(
              notifier: history,
              child: AnimatedBuilder(
                animation: settings,
                builder: (context, _) => MaterialApp(
                  title: 'Nura Wallet',
                  debugShowCheckedModeBanner: false,

                  theme: AppTheme.light(),
                  darkTheme: AppTheme.dark(),
                  themeMode: settings.theme.mode,

                  locale: settings.locale,
                  supportedLocales: AppLocalizations.supportedLocales,
                  localizationsDelegates:
                      const <LocalizationsDelegate<dynamic>>[
                        AppLocalizations.delegate,
                        GlobalWidgetsLocalizations.delegate,
                        GlobalMaterialLocalizations.delegate,
                        GlobalCupertinoLocalizations.delegate,
                      ],

                  home: const _Shell(),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Renders whichever screen the session stage calls for.
class _Shell extends StatelessWidget {
  const _Shell();

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      child: switch (session.stage) {
        // A held frame, not a spinner. Reading the store takes milliseconds, and a spinner that
        // appears and vanishes inside one frame reads as a flicker rather than as progress.
        SessionStage.loading => const _Blank(),
        SessionStage.locked => const UnlockScreen(),
        SessionStage.intro => const IntroScreen(),
        SessionStage.unlocked => const DashboardScreen(),
      },
    );
  }
}

class _Blank extends StatelessWidget {
  const _Blank();

  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox.expand());
}
