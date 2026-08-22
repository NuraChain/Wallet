import 'package:intl/intl.dart';

import 'l10n/translations.dart';

/// `0x1234…abcd` — an address short enough for a list row.
///
/// The ellipsis is the single character, not three dots: three dots in a monospace row are three
/// columns wide and push the tail off the end on a narrow screen.
String shortAddress(String address, {int lead = 6, int tail = 4}) =>
    address.length <= lead + tail
    ? address
    : '${address.substring(0, lead)}…${address.substring(address.length - tail)}';

/// An integer amount as a decimal string, at most [places] fractional digits.
///
/// Formatted from the integer rather than through a double: 18 decimals does not fit in a double,
/// and a rounded amount is a different amount. Truncates for the same reason the balance does —
/// rounding up shows a transfer larger than the one that happened.
String formatUnits(BigInt value, int decimals, {int places = 6}) {
  final negative = value.isNegative;
  final magnitude = value.abs();
  final unit = BigInt.from(10).pow(decimals < 0 ? 0 : decimals);

  final whole = magnitude ~/ unit;
  final fraction = magnitude.remainder(unit);

  final sign = negative ? '-' : '';

  if (fraction == BigInt.zero || places <= 0) {
    return '$sign$whole';
  }

  final digits = fraction
      .toString()
      .padLeft(decimals, '0')
      .substring(0, decimals < places ? decimals : places)
      .replaceAll(RegExp(r'0+$'), '');

  return digits.isEmpty ? '$sign$whole' : '$sign$whole.$digits';
}

/// The months of the Persian calendar, in Persian.
const List<String> _persianMonths = <String>[
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

/// One date on the Persian calendar, as a year/month/day triple.
typedef PersianDate = ({int year, int month, int day});

/// Integer division that truncates towards zero, and its matching remainder.
///
/// Not `floor`. The reference implementation of this calendar is written in terms of truncating
/// division, and several of its intermediate terms are negative — `(month - 8) / 6` is negative for
/// every month before August. Flooring those instead moves the start of the year by a day or more,
/// which is a whole month wrong once the offset is divided down.
int _div(int a, int b) => a ~/ b;

int _mod(int a, int b) => a.remainder(b);

/// The years a Persian leap rule changes, from Borkowski's arithmetic form of the calendar.
///
/// The Persian calendar's leap years are astronomical rather than cyclic — the year begins on the
/// day of the March equinox at Tehran — so no fixed cycle reproduces it. This table is the standard
/// arithmetic approximation, exact over the range the wallet can plausibly show a date in.
const List<int> _breaks = <int>[
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, //
  1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

/// Where a Persian year starts, and whether it is a leap year.
({int leap, int gregorianYear, int march}) _persianYear(int year) {
  final gregorianYear = year + 621;

  int leapJ = -14;
  int previous = _breaks.first;

  int jump = 0;

  for (int index = 1; index < _breaks.length; index += 1) {
    final current = _breaks[index];

    jump = current - previous;

    if (year < current) {
      break;
    }

    leapJ += _div(jump, 33) * 8 + _div(_mod(jump, 33), 4);
    previous = current;
  }

  int elapsed = year - previous;

  leapJ += _div(elapsed, 33) * 8 + _div(_mod(elapsed, 33) + 3, 4);

  if (_mod(jump, 33) == 4 && jump - elapsed == 4) {
    leapJ += 1;
  }

  final leapG =
      _div(gregorianYear, 4) -
      _div((_div(gregorianYear, 100) + 1) * 3, 4) -
      150;

  final march = 20 + leapJ - leapG;

  if (jump - elapsed < 6) {
    elapsed = elapsed - jump + _div(jump + 4, 33) * 33;
  }

  final int leap = _mod(_mod(elapsed + 1, 33) - 1, 4);

  // Truncated remainder, so this really can come back negative — and that case is the leap year.
  return (
    leap: leap == -1 ? 4 : leap,
    gregorianYear: gregorianYear,
    march: march,
  );
}

/// The Julian day number of a Gregorian date.
int _gregorianToJulian(int year, int month, int day) {
  int julian =
      _div((year + _div(month - 8, 6) + 100100) * 1461, 4) +
      _div(153 * _mod(month + 9, 12) + 2, 5) +
      day -
      34840408;

  return julian -
      _div(_div(year + 100100 + _div(month - 8, 6), 100) * 3, 4) +
      752;
}

/// A Gregorian date on the Persian calendar.
///
/// Exposed for the tests, which check it against dates whose Persian form is a matter of record.
PersianDate toPersian(DateTime date) {
  final julian = _gregorianToJulian(date.year, date.month, date.day);

  int year = date.year - 621;

  final start = _persianYear(year);

  final firstDay = _gregorianToJulian(start.gregorianYear, 3, start.march);

  int offset = julian - firstDay;

  if (offset >= 0) {
    if (offset <= 185) {
      return (
        year: year,
        month: 1 + _div(offset, 31),
        day: _mod(offset, 31) + 1,
      );
    }

    offset -= 186;
  } else {
    // Before Nowruz, so this is still the previous Persian year. The leap flag is the one belonging
    // to the year that *starts* in this Gregorian year, not the year being returned — it is what
    // decides whether the Esfand now being counted back into had twenty-nine days or thirty.
    year -= 1;
    offset += 179;

    if (start.leap == 1) {
      offset += 1;
    }
  }

  return (year: year, month: 7 + _div(offset, 30), day: _mod(offset, 30) + 1);
}

/// The Persian digits, for the one language that reads dates in them.
const String _persianDigits = '۰۱۲۳۴۵۶۷۸۹';

String _persianNumber(int value) =>
    value.toString().split('').map((d) => _persianDigits[int.parse(d)]).join();

/// A moment as a short calendar date in the active language.
///
/// Persian reads on the Persian calendar, which is what the shipping build shows: a Persian speaker
/// given "22 Aug 2026" has to convert it themselves to know whether a transfer was this week. Every
/// other language reads its own short Gregorian date.
String formatDate(DateTime moment, AppLanguage language) {
  if (language == AppLanguage.fa) {
    final date = toPersian(moment);

    return '${_persianNumber(date.day)} ${_persianMonths[date.month - 1]} ${_persianNumber(date.year)}';
  }

  return DateFormat.yMMMd(language.code).format(moment);
}
