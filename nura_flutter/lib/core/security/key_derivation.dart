import 'dart:convert';
import 'dart:typed_data';

import 'package:hashlib/hashlib.dart';

/// Argon2id as the TypeScript build runs it, and it has to stay exactly that.
///
/// These parameters are not a policy choice that can be revisited here. They are what every existing
/// installation's vault was encrypted under, so a build that changes any of them cannot decrypt a
/// wallet that already exists — and the failure would surface on a user's device at unlock time, long
/// after it could be caught. `storage.ts` and `password.ts` in the Tauri app both use this cost.
///
/// 64 MiB with three passes is deliberately expensive: it is the only thing standing between a stolen
/// device and an offline guess at the passphrase protecting the recovery phrase.
class Argon2Params {
  const Argon2Params._();

  static const int memorySizeKb = 65536;
  static const int iterations = 3;
  static const int parallelism = 1;
  static const int hashLength = 32;
}

/// The fixed salt the unlock hash is taken over.
///
/// A per-user random salt would be stronger and the Tauri build explains why it does not use one: the
/// hash only ever guards this device's own unlock screen, and a random salt would have to be stored
/// beside it regardless. It is repeated here because changing it would lock every existing user out
/// of their own wallet, not because it is a good pattern to copy.
const String unlockSalt = 'ApplicationSaltAt2026';

/// Derives the 32-byte AES key a vault is encrypted under.
///
/// [password] is the user's passphrase and [salt] is the per-vault random salt stored alongside the
/// ciphertext. The result is raw key material and should never be logged, serialised or held longer
/// than the operation that needs it.
Uint8List deriveVaultKey(String password, Uint8List salt) {
  return _argon2(utf8.encode(password), salt);
}

/// Hashes a passphrase for the unlock screen, in the lowercase hex the Tauri build stores.
///
/// Empty input is refused rather than hashed. The upstream `hash-wasm` binding throws on an empty
/// password, so a wallet could never have been created with one — accepting it here would invent a
/// hash for a passphrase no stored wallet can have, and quietly change what the unlock screen means.
String hashUnlockPassword(String password) {
  if (password.isEmpty) {
    throw ArgumentError.value(password, 'password', 'must not be empty');
  }

  final digest = _argon2(
    utf8.encode(password),
    Uint8List.fromList(utf8.encode(unlockSalt)),
  );

  return digest.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}

Uint8List _argon2(List<int> password, Uint8List salt) {
  // Version and type are stated rather than left to the defaults. They are part of what the existing
  // ciphertext was produced under, and a library changing its own default would otherwise silently
  // change the key this derives.
  final argon2 = Argon2(
    version: Argon2Version.v13,
    type: Argon2Type.argon2id,
    iterations: Argon2Params.iterations,
    parallelism: Argon2Params.parallelism,
    memorySizeKB: Argon2Params.memorySizeKb,
    hashLength: Argon2Params.hashLength,
    salt: salt,
  );

  return Uint8List.fromList(argon2.convert(password).bytes);
}
