import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/core/security/vault_cipher.dart';
import 'package:nura_wallet/data/storage/legacy_store.dart';

Map<String, dynamic> _vectors() =>
    jsonDecode(File('test/vectors/reference_vectors.json').readAsStringSync())
        as Map<String, dynamic>;

void main() {
  final vectors = _vectors();
  final cipher = VaultCipher();

  group('vault cipher', () {
    final vault = vectors['vaultKdf'] as Map<String, dynamic>;
    final sealed = vectors['vaultCipher'] as Map<String, dynamic>;

    final payload = VaultPayload(
      salt: Uint8List.fromList(base64Decode(vault['saltBase64'] as String)),
      iv: Uint8List.fromList(base64Decode(sealed['ivBase64'] as String)),
      cipher: Uint8List.fromList(
        base64Decode(sealed['cipherBase64'] as String),
      ),
    );

    // The decisive test of the whole migration: a blob produced by the shipping TypeScript build,
    // opened by Dart. If this passes, existing wallets survive the port.
    test('opens a blob written by the TypeScript build', () async {
      expect(
        await cipher.open(payload, vault['password'] as String),
        sealed['plaintext'],
      );
    });

    test('refuses the wrong passphrase', () async {
      expect(
        cipher.open(payload, 'not the passphrase'),
        throwsA(isA<VaultOpenException>()),
      );
    });

    test('refuses a tampered ciphertext', () async {
      final tampered = Uint8List.fromList(payload.cipher);
      tampered[0] ^= 0xFF;

      expect(
        cipher.open(
          VaultPayload(salt: payload.salt, iv: payload.iv, cipher: tampered),
          vault['password'] as String,
        ),
        throwsA(isA<VaultOpenException>()),
      );
    });

    test('round-trips its own output', () async {
      const secret =
          'legal winner thank year wave sausage worth useful legal winner thank yellow';

      final written = await cipher.seal(secret, 'hunter2');

      expect(await cipher.open(written, 'hunter2'), secret);
    });

    test('never reuses a salt or IV between writes', () async {
      final a = await cipher.seal('x', 'hunter2');
      final b = await cipher.seal('x', 'hunter2');

      expect(a.salt, isNot(b.salt));
      expect(a.iv, isNot(b.iv));
      expect(a.iv.length, 12);
      expect(a.salt.length, 16);
    });

    test('survives the JSON shape the store holds it in', () async {
      final written = await cipher.seal('round trip', 'hunter2');
      final revived = VaultPayload.fromJson(
        jsonDecode(jsonEncode(written.toJson())) as Map<String, dynamic>,
      );

      expect(await cipher.open(revived, 'hunter2'), 'round trip');
    });

    test('rejects a payload encrypted under an algorithm we never wrote', () {
      expect(
        () => VaultPayload.fromJson(<String, dynamic>{
          'salt': base64Encode(payload.salt),
          'iv': base64Encode(payload.iv),
          'cipher': base64Encode(payload.cipher),
          'kdf': 'scrypt',
        }),
        throwsFormatException,
      );
    });

    test('accepts a vault written before the kdf field existed', () async {
      final revived = VaultPayload.fromJson(<String, dynamic>{
        'salt': base64Encode(payload.salt),
        'iv': base64Encode(payload.iv),
        'cipher': base64Encode(payload.cipher),
      });

      expect(
        await cipher.open(revived, vault['password'] as String),
        sealed['plaintext'],
      );
    });
  });

  group('legacy store', () {
    // The file the Tauri build actually writes: pretty-printed JSON, flat string keys, with the
    // vault itself stored as a JSON string *inside* one of those values.
    String storeFile(String vaultJson) => const JsonEncoder.withIndent('  ')
        .convert(<String, dynamic>{
          'App.Language': 'fa',
          'App.Theme': 'dark',
          'App.Network': 'nura',
          'Wallet.Mnemonic': vaultJson,
          'Wallet.Password': 'a' * 64,
          'Wallet.Active': '0',
        });

    test('reads keys the old app wrote', () {
      final store = LegacyStore.parse(storeFile('{}'));

      expect(store.string(LegacyStore.keyLanguage), 'fa');
      expect(store.string(LegacyStore.keyTheme), 'dark');
      expect(store.string(LegacyStore.keyActive), '0');
      expect(store.unlockHash, 'a' * 64);
    });

    test('surfaces the encrypted vault for decryption', () async {
      final vault = vectors['vaultKdf'] as Map<String, dynamic>;
      final sealed = vectors['vaultCipher'] as Map<String, dynamic>;

      final inner = jsonEncode(<String, dynamic>{
        'salt': vault['saltBase64'],
        'iv': sealed['ivBase64'],
        'cipher': sealed['cipherBase64'],
        'kdf': 'argon2id',
      });

      final store = LegacyStore.parse(storeFile(inner));

      expect(store.hasWallet, isTrue);

      final opened = await cipher.open(
        VaultPayload.fromJson(store.encryptedVault!),
        vault['password'] as String,
      );

      expect(opened, sealed['plaintext']);
    });

    test('reports no wallet when the key is absent', () {
      final store = LegacyStore.parse(
        jsonEncode(<String, dynamic>{'App.Theme': 'dark'}),
      );

      expect(store.hasWallet, isFalse);
      expect(store.encryptedVault, isNull);
    });

    // A wallet that is present but unreadable must never be reported as absent: the caller would
    // offer to create a new one over the top of it.
    test('throws rather than reporting an unreadable store as empty', () {
      expect(
        () => LegacyStore.parse('{ this is not json'),
        throwsFormatException,
      );
      expect(() => LegacyStore.parse('[]'), throwsFormatException);
    });
  });
}
