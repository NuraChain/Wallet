import 'dart:math' as math;
import 'dart:ui';

/// Converts an OKLCh colour to the sRGB [Color] Flutter can paint.
///
/// The entire Nura palette is authored in OKLCh — 49 tokens in each of two themes, straight out of
/// `src/assets/style.css`. CSS understands that notation natively and Flutter does not, so something
/// has to bridge it. Converting here, at runtime, rather than pasting 98 pre-computed hex values has
/// one concrete advantage: the numbers in `tokens.dart` stay identical to the numbers in the
/// stylesheet, so the two can be compared by reading them. A table of hex codes could drift from its
/// source and nobody would see it.
///
/// The maths is the OKLab specification's, unmodified: OKLCh to OKLab by polar coordinates, OKLab to
/// LMS through Björn Ottosson's matrix, LMS to linear sRGB, then the sRGB transfer function. It is
/// checked against the three sRGB primaries in `oklch_test.dart`.
///
/// [lightness] is a percentage (0-100) to match the CSS, [chroma] is absolute, [hue] is in degrees,
/// and [alpha] is 0-1.
Color oklch(double lightness, double chroma, double hue, [double alpha = 1]) {
  final l = lightness / 100;
  final radians = hue * math.pi / 180;

  final a = chroma * math.cos(radians);
  final b = chroma * math.sin(radians);

  // OKLab to (nonlinear) LMS.
  final lCone = l + 0.3963377774 * a + 0.2158037573 * b;
  final mCone = l - 0.1055613458 * a - 0.0638541728 * b;
  final sCone = l - 0.0894841775 * a - 1.2914855480 * b;

  final lLinear = lCone * lCone * lCone;
  final mLinear = mCone * mCone * mCone;
  final sLinear = sCone * sCone * sCone;

  // LMS to linear sRGB.
  final red =
      4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear;
  final green =
      -1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear;
  final blue =
      -0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.7076147010 * sLinear;

  return Color.fromARGB(
    _channel(alpha),
    _channel(_gamma(red)),
    _channel(_gamma(green)),
    _channel(_gamma(blue)),
  );
}

/// The sRGB transfer function.
double _gamma(double value) {
  final sign = value.isNegative ? -1.0 : 1.0;
  final magnitude = value.abs();

  return magnitude <= 0.0031308
      ? value * 12.92
      : sign * (1.055 * math.pow(magnitude, 1 / 2.4) - 0.055);
}

/// Clamps to a byte.
///
/// OKLCh describes colours outside what sRGB can show, and several of the wallet's accents sit near
/// that edge. Clipping each channel is what a browser does with the same token, so clipping here
/// keeps Flutter and the CSS showing the same colour rather than a more "correct" different one.
int _channel(double value) => (value.clamp(0.0, 1.0) * 255).round();
