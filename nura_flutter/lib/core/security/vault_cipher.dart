import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import 'key_derivation.dart';

/// The encrypted blob exactly as the Tauri build writes it into the store.
///
/// Four base64 fields under one key. `kdf` was added later and is absent from the oldest vaults,
/// which is why reading it is tolerant: anything that is not explicitly some *other* algorithm is
/// Argon2id, because Argon2id is all this app has ever written.
class VaultPayload {
  const VaultPayload({
    required this.salt,
    required this.iv,
    required this.cipher,
    this.kdf = 'argon2id',
  });

  final Uint8List salt;
  final Uint8List iv;
  final Uint8List cipher;
  final String kdf;

  /// Reads the stored JSON object, or throws [FormatException] if it is not one of ours.
  factory VaultPayload.fromJson(Map<String, dynamic> json) {
    final salt = json['salt'];
    final iv = json['iv'];
    final cipher = json['cipher'];

    if (salt is! String || iv is! String || cipher is! String) {
      throw const FormatException(
        'vault payload is missing salt, iv or cipher',
      );
    }

    final kdf = json['kdf'];

    if (kdf is String && kdf != 'argon2id') {
      throw FormatException('unsupported vault kdf: $kdf');
    }

    return VaultPayload(
      salt: Uint8List.fromList(base64Decode(salt)),
      iv: Uint8List.fromList(base64Decode(iv)),
      cipher: Uint8List.fromList(base64Decode(cipher)),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'salt': base64Encode(salt),
    'iv': base64Encode(iv),
    'cipher': base64Encode(cipher),
    'kdf': kdf,
  };
}

/// Thrown when a vault will not open. Deliberately says nothing about why.
///
/// AES-GCM cannot tell a wrong passphrase from tampered storage — both surface as a failed tag check,
/// and that is the point of using an authenticated cipher. Reporting them differently would also hand
/// an attacker with the file a way to confirm guesses against it.
class VaultOpenException implements Exception {
  const VaultOpenException();

  @override
  String toString() => 'VaultOpenException: the vault could not be opened';
}

/// AES-GCM-256 over an Argon2id-derived key, matching `storage.ts`.
///
/// The one detail that has to be right is where the authentication tag lives. WebCrypto returns it
/// appended to the ciphertext, so that is how every existing vault is stored; Dart's `cryptography`
/// models it as a separate field. Splitting the trailing 16 bytes is what bridges the two, and
/// getting it wrong produces a vault that encrypts fine and can never be decrypted again.
class VaultCipher {
  VaultCipher({AesGcm? algorithm})
    : _algorithm = algorithm ?? AesGcm.with256bits();

  final AesGcm _algorithm;

  static const int _tagLength = 16;
  static const int _ivLength = 12;
  static const int _saltLength = 16;

  /// Decrypts a stored vault with the user's passphrase.
  Future<String> open(VaultPayload payload, String password) async {
    if (payload.cipher.length < _tagLength) {
      throw const VaultOpenException();
    }

    final split = payload.cipher.length - _tagLength;

    final box = SecretBox(
      payload.cipher.sublist(0, split),
      nonce: payload.iv,
      mac: Mac(payload.cipher.sublist(split)),
    );

    final key = SecretKey(deriveVaultKey(password, payload.salt));

    try {
      return utf8.decode(await _algorithm.decrypt(box, secretKey: key));
    } on SecretBoxAuthenticationError {
      throw const VaultOpenException();
    }
  }

  /// Encrypts a secret under a fresh salt and IV, in the layout the Tauri build reads.
  ///
  /// Both are drawn per write and never reused: an AES-GCM key/IV pair used twice leaks the XOR of
  /// the two plaintexts and destroys the authentication guarantee entirely.
  Future<VaultPayload> seal(String secret, String password) async {
    final salt = _random(_saltLength);
    final iv = _random(_ivLength);

    final key = SecretKey(deriveVaultKey(password, salt));

    final box = await _algorithm.encrypt(
      utf8.encode(secret),
      secretKey: key,
      nonce: iv,
    );

    return VaultPayload(
      salt: salt,
      iv: iv,
      cipher: Uint8List.fromList(<int>[...box.cipherText, ...box.mac.bytes]),
    );
  }

  /// Salt and IV bytes, from the platform CSPRNG and nothing else.
  ///
  /// `Random.secure()` is backed by the operating system's entropy source. The convenience
  /// generators some crypto libraries expose under names like "fast" are seeded PRNGs — fine for
  /// test data, catastrophic here: a predictable IV under a reused key is exactly the failure that
  /// turns AES-GCM from authenticated encryption into a plaintext leak.
  Uint8List _random(int length) {
    final random = Random.secure();

    return Uint8List.fromList(
      List<int>.generate(length, (_) => random.nextInt(256)),
    );
  }
}
