import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

import '../theme/app_theme.dart';

/// The card's palette, fixed rather than themed.
///
/// A backup written to the gallery outlives whatever the app looked like the day it was saved, and
/// a light-theme card is a page of pale text someone will photograph badly or print. These are the
/// Tauri build's own canvas colours, kept so a phrase exported from either build looks the same.
abstract final class _Ink {
  static const Color ground = Color(0xFF0C1740);
  static const Color cell = Color(0xFF16224F);
  static const Color word = Color(0xFFFFFFFF);
  static const Color number = Color(0xFF7DA2E8);
  static const Color warning = Color(0xFFFF9B9B);
}

/// The grid the words are laid out on, in pixels.
abstract final class _Card {
  static const int columns = 3;
  static const double cellWidth = 300;
  static const double cellHeight = 84;

  /// The gap between a cell's box and the next cell's box.
  static const double cellInset = 16;

  static const double pad = 56;

  /// The band above the grid that holds the title, and the one below it that holds the warning.
  static const double titleBand = 120;
  static const double warningBand = 80;
}

/// Draws the recovery phrase as a PNG and returns the encoded bytes.
///
/// Composed here rather than captured off the screen, so the file holds the words and the warning
/// and nothing else that happened to be on display — no balance, no address, no notification that
/// arrived while the dialog was open.
///
/// A private key is one 66-character token and has no grid to draw, so it is never sent here; the
/// dialog offers it the text file only.
Future<Uint8List> phraseToPng(
  List<String> words, {
  required String title,
  required String warning,
  TextDirection direction = TextDirection.ltr,
}) async {
  final rows = (words.length / _Card.columns).ceil();

  final width = _Card.pad * 2 + _Card.cellWidth * _Card.columns;
  final height =
      _Card.pad * 2 +
      _Card.titleBand +
      rows * _Card.cellHeight +
      _Card.warningBand;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);

  canvas.drawRect(
    Rect.fromLTWH(0, 0, width, height),
    Paint()..color = _Ink.ground,
  );

  final painter = TextPainter(textDirection: direction);

  /// Lays out one run and paints it with [at] as its top-left corner.
  ///
  /// Returns the height it took, so a caller that centres something can ask before it commits to a
  /// position. Canvas text is positioned by baseline and this is not, which is why nothing here
  /// reproduces the TypeScript's y-coordinates directly.
  double draw(
    String text,
    Offset at,
    TextStyle style, {
    double maxWidth = double.infinity,
    TextAlign align = TextAlign.start,
    TextDirection? runDirection,
  }) {
    painter
      ..textDirection = runDirection ?? direction
      ..textAlign = align
      ..text = TextSpan(text: text, style: style)
      ..layout(maxWidth: maxWidth);

    painter.paint(canvas, at);

    return painter.height;
  }

  const sans = NuraTypography.fontFamily;

  final band = width - _Card.pad * 2;

  draw(
    title,
    const Offset(_Card.pad, _Card.pad),
    const TextStyle(
      fontFamily: sans,
      fontSize: 40,
      fontWeight: FontWeight.w700,
      color: _Ink.word,
    ),
    maxWidth: band,
    align: TextAlign.start,
  );

  for (var index = 0; index < words.length; index++) {
    final left = _Card.pad + (index % _Card.columns) * _Card.cellWidth;
    final top =
        _Card.pad +
        _Card.titleBand +
        (index ~/ _Card.columns) * _Card.cellHeight;

    final box = Rect.fromLTWH(
      left,
      top,
      _Card.cellWidth - _Card.cellInset,
      _Card.cellHeight - _Card.cellInset,
    );

    canvas.drawRRect(
      RRect.fromRectAndRadius(box, const Radius.circular(12)),
      Paint()..color = _Ink.cell,
    );

    // The number and the word are pinned left-to-right whatever the surrounding language: a numbered
    // English word list read right-to-left puts the index on the wrong side of the word it counts.
    final numberStyle = const TextStyle(
      fontFamily: sans,
      fontSize: 26,
      color: _Ink.number,
    );

    final wordStyle = const TextStyle(
      fontFamily: NuraTypography.monoFamily,
      fontFamilyFallback: NuraTypography.monoFallback,
      fontSize: 30,
      fontWeight: FontWeight.w700,
      color: _Ink.word,
    );

    painter
      ..textDirection = TextDirection.ltr
      ..textAlign = TextAlign.start
      ..text = TextSpan(text: '${index + 1}', style: numberStyle)
      ..layout();

    painter.paint(
      canvas,
      Offset(box.left + 18, box.center.dy - painter.height / 2),
    );

    painter
      ..text = TextSpan(text: words[index], style: wordStyle)
      ..layout(maxWidth: box.width - 62 - 12);

    painter.paint(
      canvas,
      Offset(box.left + 62, box.center.dy - painter.height / 2),
    );
  }

  final warningStyle = const TextStyle(
    fontFamily: sans,
    fontSize: 24,
    color: _Ink.warning,
  );

  painter
    ..textDirection = direction
    ..textAlign = TextAlign.start
    ..text = TextSpan(text: warning, style: warningStyle)
    ..layout(maxWidth: band);

  painter.paint(canvas, Offset(_Card.pad, height - _Card.pad - painter.height));

  painter.dispose();

  final picture = recorder.endRecording();

  // Rounded up rather than truncated: `toImage` takes whole pixels, and a card sized down to the
  // nearest one clips the right-hand column of cells rather than shrinking to fit.
  final image = await picture.toImage(width.ceil(), height.ceil());

  final data = await image.toByteData(format: ui.ImageByteFormat.png);

  image.dispose();
  picture.dispose();

  if (data == null) {
    throw StateError('the phrase card could not be encoded as a PNG');
  }

  return data.buffer.asUint8List();
}
