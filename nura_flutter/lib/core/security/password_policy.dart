/// Why a passphrase was rejected, or null when it is acceptable.
enum PasswordIssue { mismatch, length }

/// The rule the intro flows enforce before a wallet is created.
///
/// Six to thirty-two characters, and the confirmation must match. Both bounds and the order of the
/// two checks are carried over from `passwordIssue` in the Tauri build rather than reconsidered:
/// a user migrating between the two builds must not find that a passphrase the old one accepted is
/// refused by the new one, or the reverse.
///
/// Mismatch is reported before length, so someone who typed the same wrong-length value twice is
/// told the useful thing rather than being sent to fix a typo that is not there.
abstract final class PasswordPolicy {
  static const int minimum = 6;
  static const int maximum = 32;

  static PasswordIssue? check(String password, String confirm) {
    if (password != confirm) {
      return PasswordIssue.mismatch;
    }

    if (password.length < minimum || password.length > maximum) {
      return PasswordIssue.length;
    }

    return null;
  }
}

/// Compares two hex digests without leaking where they diverge.
///
/// A plain `==` on strings returns as soon as it finds a difference, so the time it takes is a
/// function of how many leading characters were right. That is a usable oracle against a stored
/// hash. Reading every character regardless removes the signal.
///
/// Kept even though the digests being compared are local: the property costs one loop, and code that
/// is written the careful way only when someone remembers to is code that eventually is not.
bool constantTimeEquals(String a, String b) {
  if (a.length != b.length) {
    return false;
  }

  var difference = 0;

  for (var i = 0; i < a.length; i++) {
    difference |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
  }

  return difference == 0;
}
