import 'dart:ui';

import 'package:flutter/material.dart';

import '../../application/session_controller.dart';
import '../../core/l10n/app_localizations.dart';
import '../../data/export/phrase_exporter.dart';
import '../../domain/wallet/hd_wallet.dart';
import '../export/phrase_image.dart';
import '../theme/app_theme.dart';
import '../widgets/nura_alert.dart';
import '../widgets/nura_button.dart';
import '../widgets/nura_field.dart';
import '../widgets/nura_modal.dart';
import '../widgets/nura_text.dart';

/// The two files the secret can be written as.
///
/// The picture is a three-column grid of numbered words, so it is offered for a phrase only — a
/// private key is one unbroken 66-character token and would run straight out of the first cell. The
/// key gets the text file, which holds it exactly as it is.
enum _Export {
  image(Icons.image_outlined, 'Dashboard.Phrase.SaveImage'),
  text(Icons.description_outlined, 'Dashboard.Phrase.SaveText');

  const _Export(this.icon, this.label);

  final IconData icon;
  final String label;
}

/// Password-gated reveal of the wallet's secret.
///
/// Anyone holding it owns the wallet outright, so the flow puts two deliberate steps in the way.
/// First the password is checked — by decrypting the stored vault, the same gate the unlock screen
/// goes through — and the secret is read back out of storage rather than taken from the open
/// session, so an unlocked wallet is not by itself permission to see the phrase.
///
/// Then it renders blurred behind a tap-to-reveal cover, which is what stops it appearing to whoever
/// happens to be looking at the screen at that moment.
///
/// What is behind the cover depends on how the wallet was imported: a mnemonic renders as the
/// numbered word grid, a private key as the one token it is. The kind comes from the session rather
/// than being read off the secret, because the title and the button are on screen before anything is
/// decrypted and they have to name the right thing from the start.
///
/// The secret is deliberately not selectable: the clipboard is readable by other apps.
class PhraseSheet extends StatefulWidget {
  const PhraseSheet({super.key, required this.session, this.exporter});

  final SessionController session;

  /// The writer the export buttons hand the secret to.
  ///
  /// Injectable so a test can prove what the dialog would have written without putting a real
  /// recovery phrase into the gallery of the machine running it.
  final PhraseExporter? exporter;

  @override
  State<PhraseSheet> createState() => _PhraseSheetState();
}

class _PhraseSheetState extends State<PhraseSheet> {
  final TextEditingController _password = TextEditingController();

  late final PhraseExporter _exporter =
      widget.exporter ?? PhraseExporter.platform();

  String _secret = '';
  String _error = '';
  String _notice = '';
  bool _revealed = false;
  bool _busy = false;

  bool get _isKey => widget.session.kind == VaultKind.privateKey;

  List<String> get _words =>
      _secret.isEmpty ? const <String>[] : _secret.trim().split(RegExp(r'\s+'));

  @override
  void dispose() {
    _password.dispose();

    super.dispose();
  }

  Future<void> _unlock() async {
    if (_password.text.trim().isEmpty) {
      setState(() => _error = context.t('Dashboard.Phrase.ErrorRequired'));

      return;
    }

    setState(() {
      _error = '';
      _busy = true;
    });

    final read = await widget.session.reveal(_password.text);

    if (!mounted) {
      return;
    }

    final secret = read.secret;

    setState(() {
      _busy = false;

      if (secret != null) {
        _secret = secret.trim();

        return;
      }

      // Anything that is not a wrong password is reported as the secret being unreadable. From the
      // user's side those are the same situation — the wallet will not show them their phrase — and
      // the difference between a missing payload and a corrupt one is not theirs to act on.
      _error = read.failure == UnlockFailure.wrongPassword
          ? context.t('Dashboard.Phrase.ErrorInvalid')
          : _isKey
          ? context.t('Dashboard.Phrase.ErrorMissingKey')
          : context.t('Dashboard.Phrase.ErrorMissing');
    });
  }

  /// Hands the secret to the platform as a picture or a text file.
  ///
  /// Only reachable once it is revealed, so exporting always follows an explicit password check and
  /// an explicit tap.
  Future<void> _export(_Export format) async {
    if (_secret.isEmpty) {
      return;
    }

    final stamp = DateTime.now().toIso8601String().substring(0, 10);
    final name = _isKey
        ? 'nura-private-key-$stamp'
        : 'nura-recovery-phrase-$stamp';

    // Read before the first await: `context` is not safe to touch once one has been crossed, and
    // both of these are strings the export needs on the far side of it.
    final imageTitle = context.t('Dashboard.Phrase.ExportImageTitle');
    final imageWarning = context.t('Dashboard.Phrase.ExportImageWarning');
    final direction = context.direction;

    final failure = switch (format) {
      _Export.image => await _exporter.saveImage(
        await phraseToPng(
          _words,
          title: imageTitle,
          warning: imageWarning,
          direction: direction,
        ),
        '$name.png',
      ),
      // The numbered list is what makes a written-down phrase checkable; a key is one value and any
      // numbering around it would be noise in the file the user has to paste back somewhere.
      _Export.text => await _exporter.saveText(
        _isKey
            ? _secret
            : <String>[
                for (var i = 0; i < _words.length; i++)
                  '${i + 1}. ${_words[i]}',
              ].join('\n'),
        '$name.txt',
      ),
    };

    if (!mounted) {
      return;
    }

    setState(() {
      if (failure.isEmpty) {
        _notice = format == _Export.image
            ? context.t('Dashboard.Phrase.ExportSavedImage')
            : context.t('Dashboard.Phrase.ExportSavedText');

        return;
      }

      _notice = failure == PhraseExporter.unsupported
          ? context.t('Dashboard.Phrase.ExportUnsupported')
          : context.t('Dashboard.Phrase.ExportFailed');
    });
  }

  @override
  Widget build(BuildContext context) {
    void close() => Navigator.of(context).pop();

    return NuraModal(
      scroll: true,
      onClose: close,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NuraModalHeader(
            title: _isKey
                ? context.t('Dashboard.Phrase.TitleKey')
                : context.t('Dashboard.Phrase.Title'),
            onClose: close,
          ),
          const SizedBox(height: NuraMetrics.gap),

          NuraAlert(
            variant: NuraAlertVariant.warning,
            text: _isKey
                ? context.t('Dashboard.Phrase.WarningKey')
                : context.t('Dashboard.Phrase.Warning'),
          ),

          if (_error.isNotEmpty) ...<Widget>[
            const SizedBox(height: NuraMetrics.gap),
            NuraAlert(text: _error),
          ],

          const SizedBox(height: NuraMetrics.gap),

          if (_secret.isEmpty) ..._gate(context) else ..._reveal(context),
        ],
      ),
    );
  }

  List<Widget> _gate(BuildContext context) {
    return <Widget>[
      NuraTextField(
        controller: _password,
        label: context.t('Dashboard.Phrase.Password'),
        obscure: true,
        onSubmitted: (_) => _unlock(),
        leading: Icon(Icons.lock_outline, color: context.colors.txtMuted),
      ),
      const SizedBox(height: NuraMetrics.gap),
      NuraButton(
        text: _busy
            ? context.t('Dashboard.Phrase.Pending')
            : _isKey
            ? context.t('Dashboard.Phrase.UnlockKey')
            : context.t('Dashboard.Phrase.Unlock'),
        variant: NuraButtonVariant.primary,
        size: NuraButtonSize.action,
        fullWidth: true,
        loading: _busy,
        onPressed: _unlock,
      ),
    ];
  }

  List<Widget> _reveal(BuildContext context) {
    final secret = _isKey ? _KeyBox(secret: _secret) : _WordGrid(words: _words);

    return <Widget>[
      Stack(
        children: <Widget>[
          // Blurred rather than withheld, so the shape of what is coming is already on screen and
          // the reveal lands where the eye is looking. `IgnorePointer` is what makes the blur mean
          // something: without it the words underneath are still selectable through the cover.
          IgnorePointer(
            ignoring: !_revealed,
            child: _revealed
                ? secret
                : ImageFiltered(
                    imageFilter: ImageFilter.blur(sigmaX: 4, sigmaY: 4),
                    child: secret,
                  ),
          ),
          if (!_revealed)
            Positioned.fill(
              child: NuraButton(
                variant: NuraButtonVariant.bare,
                onPressed: () => setState(() => _revealed = true),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: context.colors.base2.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(
                      NuraMetrics.radiusMedium,
                    ),
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        const Icon(Icons.visibility_outlined, size: 20),
                        NuraText(
                          context.t('Dashboard.Phrase.Reveal'),
                          variant: NuraTextVariant.captionStrong,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),

      if (_revealed) ...<Widget>[
        const SizedBox(height: NuraMetrics.gap),

        // Spelled out every time rather than shown once: a file on shared storage outlives the
        // moment it was written, and the gallery copy is the one people forget.
        NuraAlert(
          variant: NuraAlertVariant.danger,
          text: context.t('Dashboard.Phrase.ExportDanger'),
        ),
        const SizedBox(height: NuraMetrics.gapSmall),

        NuraModalActions(
          children: <Widget>[
            for (final format in _Export.values)
              if (!_isKey || format != _Export.image)
                NuraButton(
                  variant: NuraButtonVariant.muted,
                  size: NuraButtonSize.action,
                  onPressed: () => _export(format),
                  leading: Icon(format.icon, size: 14),
                  child: NuraText(
                    context.t(format.label),
                    variant: NuraTextVariant.caption,
                    maxLines: 1,
                  ),
                ),
          ],
        ),

        if (_notice.isNotEmpty) ...<Widget>[
          const SizedBox(height: NuraMetrics.gapSmall),
          NuraText(_notice, align: TextAlign.center),
        ],
      ],
    ];
  }
}

/// The mnemonic, as the numbered grid that makes it checkable against what was written down.
class _WordGrid extends StatelessWidget {
  const _WordGrid({required this.words});

  final List<String> words;

  /// Every BIP-39 length — 12, 15, 18, 21, 24 — divides by three, so the last row is always full.
  /// The empty slot below is for the length that would not, rather than for one that occurs.
  static const int columns = 3;

  @override
  Widget build(BuildContext context) {
    final rows = (words.length / columns).ceil();

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        for (var row = 0; row < rows; row++) ...<Widget>[
          if (row > 0) const SizedBox(height: NuraMetrics.gapSmall),
          Row(
            children: <Widget>[
              for (var column = 0; column < columns; column++) ...<Widget>[
                if (column > 0) const SizedBox(width: NuraMetrics.gapSmall),
                Expanded(
                  child: row * columns + column < words.length
                      ? _Word(
                          index: row * columns + column,
                          word: words[row * columns + column],
                        )
                      : const SizedBox.shrink(),
                ),
              ],
            ],
          ),
        ],
      ],
    );
  }
}

class _Word extends StatelessWidget {
  const _Word({required this.index, required this.word});

  final int index;
  final String word;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: NuraMetrics.gapSmall,
        vertical: NuraMetrics.gapTight,
      ),
      decoration: BoxDecoration(
        color: context.colors.base1,
        borderRadius: BorderRadius.circular(NuraMetrics.radiusSmall),
      ),
      // Pinned left to right whatever the interface language: a numbered English word list read
      // right to left puts each index on the far side of the word it counts.
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Row(
          children: <Widget>[
            NuraText('${index + 1}'),
            const SizedBox(width: NuraMetrics.gapTight),
            Expanded(
              child: NuraText(
                word,
                variant: NuraTextVariant.captionStrong,
                mono: true,
                maxLines: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A private key, as the one token it is.
class _KeyBox extends StatelessWidget {
  const _KeyBox({required this.secret});

  final String secret;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: NuraMetrics.gap,
        vertical: NuraMetrics.gapSmall,
      ),
      decoration: BoxDecoration(
        color: context.colors.base1,
        borderRadius: BorderRadius.circular(NuraMetrics.radiusSmall),
      ),
      child: NuraText(
        secret,
        variant: NuraTextVariant.captionStrong,
        mono: true,
        forceLtr: true,
      ),
    );
  }
}
