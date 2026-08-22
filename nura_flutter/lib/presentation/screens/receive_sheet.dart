import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/l10n/app_localizations.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_surface.dart';
import '../widgets/nura_text.dart';

/// Shows the account's address as a QR code and as text.
///
/// The code encodes the bare address, not an `ethereum:` URI. Both are read by wallets, but a plain
/// address is also read by exchanges and block explorers, and this screen's job is to be scannable
/// by whatever the user points at it.
///
/// The QR always renders on white with black modules, in both themes. A scanner needs the contrast
/// and the polarity it expects; a code drawn in the dark palette looks consistent and fails to scan
/// on a good number of readers.
class ReceiveSheet extends StatelessWidget {
  const ReceiveSheet({
    super.key,
    required this.address,
    required this.coinName,
  });

  final String address;

  /// Named in the caption, so the user knows which chain they are receiving on.
  final String coinName;

  @override
  Widget build(BuildContext context) {
    return NuraModal(
      scroll: true,
      onClose: () => Navigator.of(context).pop(),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NuraModalHeader(
            title: context.t('Dashboard.Receive.Title'),
            onClose: () => Navigator.of(context).pop(),
          ),
          const SizedBox(height: NuraMetrics.gap),

          Center(
            child: Container(
              padding: const EdgeInsets.all(NuraMetrics.gap),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(NuraMetrics.radiusMedium),
              ),
              child: QrImageView(
                data: address,
                version: QrVersions.auto,
                size: 180,
                backgroundColor: Colors.white,
                // Medium recovery: enough redundancy for a scuffed screen without inflating the
                // code so far that the modules get small on a phone.
                errorCorrectionLevel: QrErrorCorrectLevel.M,
                eyeStyle: const QrEyeStyle(
                  eyeShape: QrEyeShape.square,
                  color: Colors.black,
                ),
                dataModuleStyle: const QrDataModuleStyle(
                  dataModuleShape: QrDataModuleShape.square,
                  color: Colors.black,
                ),
              ),
            ),
          ),
          const SizedBox(height: NuraMetrics.gap),

          NuraText(
            context.t('Dashboard.Receive.Scan', <Object?>[coinName]),
            variant: NuraTextVariant.bodyMuted,
            align: TextAlign.center,
          ),
          const SizedBox(height: NuraMetrics.gap),

          GlassPanel(
            radius: NuraMetrics.radiusMedium,
            blur: false,
            shadow: false,
            padding: const EdgeInsets.all(NuraMetrics.gap),
            // The address in full, wrapped rather than shortened. This is the one place it must be
            // readable character by character — someone checking a pasted address against the
            // screen cannot check an ellipsis.
            child: NuraText(
              address,
              variant: NuraTextVariant.captionStrong,
              mono: true,
              forceLtr: true,
              align: TextAlign.center,
            ),
          ),
          const SizedBox(height: NuraMetrics.gap),

          NuraButton(
            text: context.t('Dashboard.Copy'),
            variant: NuraButtonVariant.primary,
            size: NuraButtonSize.action,
            fullWidth: true,
            leading: const Icon(Icons.copy, size: 16),
            onPressed: () => _copy(context),
          ),
        ],
      ),
    );
  }

  Future<void> _copy(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final copied = context.t('Dashboard.Copied');
    final failed = context.t('Dashboard.CopyFailed');

    try {
      await Clipboard.setData(ClipboardData(text: address));

      messenger.showSnackBar(SnackBar(content: Text(copied)));
    } on Object {
      messenger.showSnackBar(SnackBar(content: Text(failed)));
    }
  }
}
