import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/presentation/theme/app_theme.dart';
import 'package:nura_wallet/presentation/theme/tokens.dart';
import 'package:nura_wallet/presentation/widgets/nura_alert.dart';
import 'package:nura_wallet/presentation/widgets/nura_button.dart';
import 'package:nura_wallet/presentation/widgets/nura_field.dart';
import 'package:nura_wallet/presentation/widgets/nura_modal.dart';
import 'package:nura_wallet/presentation/widgets/nura_surface.dart';
import 'package:nura_wallet/presentation/widgets/nura_text.dart';

/// Mounts one widget under the real theme, optionally right-to-left.
Widget host(Widget child, {bool dark = false, TextDirection? direction}) {
  return MaterialApp(
    theme: dark ? AppTheme.dark() : AppTheme.light(),
    home: Directionality(
      textDirection: direction ?? TextDirection.ltr,
      child: Scaffold(body: Center(child: child)),
    ),
  );
}

void main() {
  group('NuraText', () {
    testWidgets('each variant takes its size and colour from the theme', (
      tester,
    ) async {
      for (final variant in NuraTextVariant.values) {
        await tester.pumpWidget(host(NuraText('x', variant: variant)));

        final style = tester.widget<Text>(find.text('x')).style!;

        expect(style.fontFamily, 'Vazirmatn');
        expect(style.fontSize, isNotNull);
        expect(style.color, isNotNull, reason: '$variant');
      }
    });

    testWidgets('muted and normal variants differ in colour, not size', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          const Column(
            children: <Widget>[
              NuraText('a', variant: NuraTextVariant.caption),
              NuraText('b', variant: NuraTextVariant.captionStrong),
            ],
          ),
        ),
      );

      final muted = tester.widget<Text>(find.text('a')).style!;
      final normal = tester.widget<Text>(find.text('b')).style!;

      expect(muted.fontSize, normal.fontSize);
      expect(muted.color, isNot(normal.color));
    });

    // An address inside a Persian screen must still run left to right, or the 0x prefix ends up on
    // the wrong end and a lookalike goes unnoticed.
    testWidgets('forceLtr pins a run inside an RTL tree', (tester) async {
      await tester.pumpWidget(
        host(
          const NuraText('0xAbC', forceLtr: true),
          direction: TextDirection.rtl,
        ),
      );

      final applied = Directionality.of(tester.element(find.text('0xAbC')));

      expect(applied, TextDirection.ltr);
    });

    testWidgets('mono switches face without changing size', (tester) async {
      await tester.pumpWidget(
        host(
          const Column(
            children: <Widget>[
              NuraText('a', variant: NuraTextVariant.body),
              NuraText('b', variant: NuraTextVariant.body, mono: true),
            ],
          ),
        ),
      );

      final plain = tester.widget<Text>(find.text('a')).style!;
      final mono = tester.widget<Text>(find.text('b')).style!;

      expect(mono.fontFamily, isNot(plain.fontFamily));
      expect(mono.fontSize, plain.fontSize);
    });
  });

  group('NuraButton', () {
    testWidgets('fires when tapped', (tester) async {
      var taps = 0;

      await tester.pumpWidget(
        host(
          NuraButton(
            text: 'Approve',
            variant: NuraButtonVariant.primary,
            size: NuraButtonSize.action,
            onPressed: () => taps++,
          ),
        ),
      );

      await tester.tap(find.text('Approve'));

      expect(taps, 1);
    });

    // A null callback is the only way to disable, so a disabled control cannot claim to have work.
    testWidgets('a null callback disables it and swallows taps', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          const NuraButton(
            text: 'Approve',
            variant: NuraButtonVariant.primary,
            size: NuraButtonSize.action,
          ),
        ),
      );

      await tester.tap(find.text('Approve'));
      await tester.pump();

      final opacity = tester.widget<AnimatedOpacity>(
        find.byType(AnimatedOpacity),
      );

      expect(opacity.opacity, lessThan(1));
    });

    testWidgets('loading shows a spinner and stops responding', (tester) async {
      var taps = 0;

      await tester.pumpWidget(
        host(
          NuraButton(
            text: 'Sending',
            variant: NuraButtonVariant.primary,
            size: NuraButtonSize.action,
            loading: true,
            onPressed: () => taps++,
          ),
        ),
      );

      expect(find.byType(NuraSpinner), findsOneWidget);

      await tester.tap(find.text('Sending'));

      expect(taps, 0, reason: 'a busy button must not fire twice');
    });

    testWidgets('every variant and size builds', (tester) async {
      for (final variant in NuraButtonVariant.values) {
        for (final size in NuraButtonSize.values) {
          await tester.pumpWidget(
            host(
              NuraButton(
                text: 'x',
                variant: variant,
                size: size,
                onPressed: () {},
              ),
            ),
          );

          expect(tester.takeException(), isNull, reason: '$variant / $size');
        }
      }
    });

    testWidgets('icon sizes are the squares the design specifies', (
      tester,
    ) async {
      const expected = <NuraButtonSize, double>{
        NuraButtonSize.icon: NuraMetrics.iconButton,
        NuraButtonSize.iconChip: NuraMetrics.iconChip,
        NuraButtonSize.iconLarge: NuraMetrics.iconLarge,
      };

      for (final entry in expected.entries) {
        await tester.pumpWidget(
          host(
            NuraButton(
              size: entry.key,
              variant: NuraButtonVariant.muted,
              onPressed: () {},
              child: const Icon(Icons.close),
            ),
          ),
        );
        await tester.pumpAndSettle();

        final box = tester.getSize(find.byType(AnimatedContainer).first);

        expect(box.width, entry.value, reason: '${entry.key}');
        expect(box.height, entry.value, reason: '${entry.key}');
      }
    });

    testWidgets('an icon-only button still has an accessible name', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(
          NuraButton(
            size: NuraButtonSize.icon,
            variant: NuraButtonVariant.muted,
            semanticLabel: 'Close browser',
            onPressed: () {},
            child: const Icon(Icons.close),
          ),
        ),
      );

      expect(find.bySemanticsLabel('Close browser'), findsOneWidget);
    });
  });

  group('NuraAlert', () {
    // Every call site passes a message that is empty until something goes wrong, so an empty alert
    // must occupy no space at all rather than leaving a gap above the form.
    testWidgets('renders nothing when there is nothing to say', (tester) async {
      await tester.pumpWidget(host(const NuraAlert(text: '')));

      expect(find.byType(Text), findsNothing);
      expect(tester.getSize(find.byType(NuraAlert)), Size.zero);
    });

    testWidgets('shows the message in the error colour', (tester) async {
      await tester.pumpWidget(
        host(const NuraAlert(text: 'Password is incorrect')),
      );

      final style = tester
          .widget<Text>(find.text('Password is incorrect'))
          .style!;

      expect(style.color, NuraColors.light.txtError);
    });

    testWidgets('the warning variant carries a glyph', (tester) async {
      await tester.pumpWidget(
        host(
          const NuraAlert(
            text: 'This cannot be undone',
            variant: NuraAlertVariant.warning,
          ),
        ),
      );

      expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
    });
  });

  group('NuraTextField', () {
    testWidgets('reports what is typed', (tester) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        host(NuraTextField(controller: controller, label: 'Recipient')),
      );

      await tester.enterText(find.byType(TextField), '0xAbC');

      expect(controller.text, '0xAbC');
      expect(find.text('Recipient'), findsOneWidget);
    });

    testWidgets('an obscured field hides its text and can reveal it', (
      tester,
    ) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        host(
          NuraTextField(
            controller: controller,
            label: 'Password',
            obscure: true,
          ),
        ),
      );

      expect(
        tester.widget<TextField>(find.byType(TextField)).obscureText,
        isTrue,
      );

      await tester.tap(find.byIcon(Icons.visibility_outlined));
      await tester.pump();

      expect(
        tester.widget<TextField>(find.byType(TextField)).obscureText,
        isFalse,
      );
    });

    // A phrase or an address typed into a Persian screen must not reverse.
    testWidgets('honours a pinned direction inside an RTL tree', (
      tester,
    ) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        host(
          NuraTextField(
            controller: controller,
            textDirection: TextDirection.ltr,
          ),
          direction: TextDirection.rtl,
        ),
      );

      expect(
        tester.widget<TextField>(find.byType(TextField)).textDirection,
        TextDirection.ltr,
      );
    });
  });

  group('NuraCheckbox', () {
    testWidgets('the label toggles it, not just the box', (tester) async {
      var checked = false;

      await tester.pumpWidget(
        host(
          StatefulBuilder(
            builder: (context, setState) => NuraCheckbox(
              checked: checked,
              text: 'I wrote it down',
              onToggle: () => setState(() => checked = !checked),
            ),
          ),
        ),
      );

      await tester.tap(find.text('I wrote it down'));
      await tester.pump();

      expect(checked, isTrue);
      expect(find.byIcon(Icons.check), findsOneWidget);
    });

    testWidgets('the row clears the minimum touch target', (tester) async {
      await tester.pumpWidget(
        host(NuraCheckbox(checked: false, text: 'x', onToggle: () {})),
      );

      expect(
        tester.getSize(find.byType(NuraCheckbox)).height,
        greaterThanOrEqualTo(40),
      );
    });
  });

  group('modal', () {
    testWidgets('opens, and the scrim closes it', (tester) async {
      await tester.pumpWidget(
        host(
          Builder(
            builder: (context) => NuraButton(
              text: 'open',
              onPressed: () => NuraModal.show<void>(
                context,
                builder: (context) => NuraModal(
                  onClose: () => Navigator.of(context).pop(),
                  child: NuraModalHeader(
                    title: 'Send',
                    onClose: () => Navigator.of(context).pop(),
                  ),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      expect(find.text('Send'), findsOneWidget);

      // Tap the scrim, well away from the centred panel.
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      expect(find.text('Send'), findsNothing);
    });

    testWidgets('the header close control dismisses it', (tester) async {
      await tester.pumpWidget(
        host(
          Builder(
            builder: (context) => NuraButton(
              text: 'open',
              onPressed: () => NuraModal.show<void>(
                context,
                builder: (context) => NuraModal(
                  onClose: () => Navigator.of(context).pop(),
                  child: NuraModalHeader(
                    title: 'Send',
                    closeLabel: 'Close',
                    onClose: () => Navigator.of(context).pop(),
                  ),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      await tester.tap(find.bySemanticsLabel('Close'));
      await tester.pumpAndSettle();

      expect(find.text('Send'), findsNothing);
    });

    testWidgets('actions split the row evenly', (tester) async {
      await tester.pumpWidget(
        host(
          SizedBox(
            width: 300,
            child: NuraModalActions(
              children: <Widget>[
                NuraButton(
                  text: 'Reject',
                  variant: NuraButtonVariant.muted,
                  size: NuraButtonSize.action,
                  onPressed: () {},
                ),
                NuraButton(
                  text: 'Approve',
                  variant: NuraButtonVariant.primary,
                  size: NuraButtonSize.action,
                  onPressed: () {},
                ),
              ],
            ),
          ),
        ),
      );

      final left = tester.getSize(
        find
            .ancestor(
              of: find.text('Reject'),
              matching: find.byType(AnimatedContainer),
            )
            .first,
      );
      final right = tester.getSize(
        find
            .ancestor(
              of: find.text('Approve'),
              matching: find.byType(AnimatedContainer),
            )
            .first,
      );

      expect(left.width, right.width);
    });
  });

  group('surfaces', () {
    testWidgets('the panel builds in both themes', (tester) async {
      for (final dark in <bool>[false, true]) {
        await tester.pumpWidget(
          host(const GlassPanel(child: NuraText('inside')), dark: dark),
        );

        expect(find.text('inside'), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    });

    testWidgets('every icon tone builds', (tester) async {
      for (final tone in IconBoxTone.values) {
        await tester.pumpWidget(
          host(IconBox(tone: tone, child: const Icon(Icons.wallet))),
        );

        expect(tester.takeException(), isNull, reason: '$tone');
      }
    });

    testWidgets('the empty state reads as empty, not as an error', (
      tester,
    ) async {
      await tester.pumpWidget(
        host(const EmptyState(text: 'Nothing to show yet.')),
      );

      final style = tester
          .widget<Text>(find.text('Nothing to show yet.'))
          .style!;

      expect(style.color, NuraColors.light.txtMuted);
      expect(find.byIcon(Icons.inbox_outlined), findsOneWidget);
    });
  });
}
