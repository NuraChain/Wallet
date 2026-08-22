import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'nura_button.dart';
import 'nura_surface.dart';
import 'nura_text.dart';

/// The app's one dialog shell: a dimmed scrim, a centred glass panel, a scale-in entrance.
///
/// The scrim carries no blur, and that is deliberate rather than an omission. A blur across the
/// whole viewport makes the compositor re-run a full-screen backdrop filter on every frame of the
/// entrance — the one shape of blur that reliably costs frames, worst on Android. The 25% dim is
/// what separates the dialog from the page; the barely-visible blur behind it was paying for the
/// entire screen. The Tauri build reached the same conclusion and left the same note.
class NuraModal extends StatelessWidget {
  const NuraModal({
    super.key,
    required this.child,
    required this.onClose,
    this.scroll = false,
    this.width = NuraMetrics.dialogWidth,
  });

  final Widget child;

  /// Called by the scrim and by the header's close control.
  final VoidCallback onClose;

  /// Caps the panel against the viewport and scrolls its content.
  final bool scroll;

  final double width;

  /// Shows this dialog over the current route.
  ///
  /// Uses a route rather than an overlay so that Android's back gesture dismisses it, which is the
  /// behaviour a user expects and the reason a dialog must not be a bare `Stack` entry.
  static Future<T?> show<T>(
    BuildContext context, {
    required WidgetBuilder builder,
  }) {
    return showGeneralDialog<T>(
      context: context,
      barrierDismissible: true,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (context, _, _) => builder(context),
      transitionBuilder: (context, animation, _, child) {
        final curved = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );

        return FadeTransition(
          opacity: curved,
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.9, end: 1).animate(curved),
            child: child,
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    final panel = GlassPanel(
      width: width,
      radius: NuraMetrics.radiusPanel,
      padding: const EdgeInsets.all(NuraMetrics.gapLarge),
      child: child,
    );

    return Stack(
      children: <Widget>[
        Positioned.fill(
          child: GestureDetector(
            onTap: onClose,
            behavior: HitTestBehavior.opaque,
            child: ColoredBox(color: colors.scrim),
          ),
        ),
        // Material, transparently. A dialog route sits outside the app's Scaffold, so nothing above
        // it provides the Material ancestor that TextField, InkWell and text selection all require —
        // without this, the first field placed in a dialog throws "No Material widget found" at
        // runtime rather than at build. `transparency` supplies the ancestor without painting
        // anything over the glass panel underneath.
        Material(
          type: MaterialType.transparency,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(NuraMetrics.gapLarge),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * 0.85,
                ),
                // Stops a tap inside the dialog from reaching the scrim behind it.
                child: GestureDetector(
                  onTap: () {},
                  child: scroll ? SingleChildScrollView(child: panel) : panel,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// The title row of a dialog: title, optional subtitle or leading box, and the close control.
///
/// The row owns the gap and the title owns its own flex, because `spaceBetween` alone only separates
/// a title that fits — one long enough to fill the panel ends up against the close button, and a
/// word longer than the space left over pushes straight through it.
class NuraModalHeader extends StatelessWidget {
  const NuraModalHeader({
    super.key,
    required this.title,
    required this.onClose,
    this.subtitle,
    this.leading,
    this.closeLabel,
  });

  final String title;
  final VoidCallback onClose;
  final String? subtitle;
  final Widget? leading;
  final String? closeLabel;

  @override
  Widget build(BuildContext context) {
    final heading = NuraText(
      title,
      variant: NuraTextVariant.title,
      maxLines: 2,
    );

    final group = subtitle == null && leading == null
        ? heading
        : leading == null
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[heading, NuraText(subtitle!)],
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              leading!,
              const SizedBox(width: NuraMetrics.gapSmall),
              Flexible(child: heading),
            ],
          );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Expanded(child: group),
        const SizedBox(width: NuraMetrics.gap),
        NuraButton(
          variant: NuraButtonVariant.muted,
          size: NuraButtonSize.icon,
          semanticLabel: closeLabel,
          onPressed: onClose,
          child: const Icon(Icons.close, size: 20),
        ),
      ],
    );
  }
}

/// The one part of a dialog that scrolls, so its header and actions do not.
class NuraModalBody extends StatelessWidget {
  const NuraModalBody({
    super.key,
    required this.children,
    this.gap = NuraMetrics.gap,
  });

  final List<Widget> children;
  final double gap;

  @override
  Widget build(BuildContext context) {
    return Flexible(
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            for (var i = 0; i < children.length; i++) ...<Widget>[
              if (i > 0) SizedBox(height: gap),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

/// The footer row: side-by-side controls that split the width evenly.
class NuraModalActions extends StatelessWidget {
  const NuraModalActions({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        for (var i = 0; i < children.length; i++) ...<Widget>[
          if (i > 0) const SizedBox(width: NuraMetrics.gapSmall),
          Expanded(child: children[i]),
        ],
      ],
    );
  }
}

/// The sheet the intro flows drop down from the top of the window.
class NuraSheet extends StatelessWidget {
  const NuraSheet({super.key, required this.child, required this.onClose});

  final Widget child;
  final VoidCallback onClose;

  static Future<T?> show<T>(
    BuildContext context, {
    required WidgetBuilder builder,
  }) {
    return showGeneralDialog<T>(
      context: context,
      barrierDismissible: true,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      barrierColor: Colors.transparent,
      transitionDuration: const Duration(milliseconds: 250),
      pageBuilder: (context, _, _) => builder(context),
      transitionBuilder: (context, animation, _, child) {
        return SlideTransition(
          position: Tween<Offset>(begin: const Offset(0, -1), end: Offset.zero)
              .animate(
                CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
              ),
          child: child,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;

    return Stack(
      children: <Widget>[
        Positioned.fill(
          child: GestureDetector(
            onTap: onClose,
            behavior: HitTestBehavior.opaque,
            child: ColoredBox(color: colors.scrim),
          ),
        ),
        // Material, transparently. A dialog route sits outside the app's Scaffold, so nothing above
        // it provides the Material ancestor that TextField, InkWell and text selection all require —
        // without this, the first field placed in a dialog throws "No Material widget found" at
        // runtime rather than at build. `transparency` supplies the ancestor without painting
        // anything over the glass panel underneath.
        Material(
          type: MaterialType.transparency,
          child: Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: NuraMetrics.gapSmall,
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 512),
                child: GestureDetector(
                  onTap: () {},
                  child: ConstrainedBox(
                    // Capped against the viewport and scrolled inside. A sheet holding a form is
                    // taller than a short window, and taller still once the keyboard is up —
                    // without this it overflows and the submit button becomes unreachable.
                    constraints: BoxConstraints(
                      maxHeight: MediaQuery.sizeOf(context).height,
                    ),
                    child: GlassPanel(
                      radius: NuraMetrics.radiusPanel,
                      child: SingleChildScrollView(
                        padding: EdgeInsets.only(
                          left: NuraMetrics.gapLarge,
                          right: NuraMetrics.gapLarge,
                          // Clears the on-screen keyboard as well as the system inset, so the field
                          // being typed into is never underneath it.
                          bottom:
                              NuraMetrics.gapLarge +
                              MediaQuery.viewInsetsOf(context).bottom,
                          // Keeps clear of the status bar on Android and the drag region on
                          // Windows.
                          top:
                              MediaQuery.paddingOf(context).top +
                              NuraMetrics.gapLarge,
                        ),
                        child: child,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
