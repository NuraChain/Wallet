import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/domain/wallet/hd_wallet.dart';

Map<String, dynamic> _vectors() =>
    jsonDecode(File('test/vectors/reference_vectors.json').readAsStringSync())
        as Map<String, dynamic>;

void main() {
  final vectors = _vectors();
  final hd = vectors['hdDerivation'] as Map<String, dynamic>;
  final mnemonic = hd['mnemonic'] as String;

  group('HD derivation', () {
    test('derives the published address at index 0', () {
      // Cross-checks against the wider ecosystem, not only against ethers: this address for this
      // mnemonic at m/44'/60'/0'/0/0 is the canonical BIP-44 test value.
      expect(HdWallet.fromMnemonic(mnemonic, 0).address, hd['knownGoodIndex0']);
    });

    for (final account
        in (hd['accounts'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      final index = account['index'] as int;

      test('index $index matches address and private key', () {
        final wallet = HdWallet.fromMnemonic(mnemonic, index);

        expect(wallet.address, account['address']);
        expect(wallet.privateKeyHex, account['privateKey']);
      });
    }

    test('uses the same base path as the TypeScript build', () {
      expect(HdWallet.basePath, hd['basePath']);
    });

    test('every index yields a distinct account', () {
      final seen = <String>{
        for (var i = 0; i < 8; i++) HdWallet.fromMnemonic(mnemonic, i).address,
      };

      expect(seen.length, 8);
    });

    test('is insensitive to surrounding and repeated whitespace', () {
      final messy = '  ${mnemonic.split(' ').join('   ')}  \n';

      expect(HdWallet.fromMnemonic(messy, 0).address, hd['knownGoodIndex0']);
    });

    test('refuses a phrase that fails the BIP-39 checksum', () {
      // Valid words, wrong checksum — the case that silently derives a stranger's wallet if a port
      // skips validation.
      const wrong =
          'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';

      expect(() => HdWallet.fromMnemonic(wrong, 0), throwsArgumentError);
      expect(
        () => HdWallet.fromMnemonic('not even words', 0),
        throwsArgumentError,
      );
    });
  });

  group('private key import', () {
    final imported = vectors['privateKeyImport'] as Map<String, dynamic>;

    test('derives the same address as the TypeScript build', () {
      expect(
        HdWallet.addressOfPrivateKey(imported['privateKey'] as String),
        imported['address'],
      );
    });

    test('accepts the key with or without the 0x prefix', () {
      final bare = (imported['privateKey'] as String).substring(2);

      expect(HdWallet.addressOfPrivateKey(bare), imported['address']);
    });

    test('refuses anything that is not a 32-byte hex key', () {
      expect(
        () => HdWallet.addressOfPrivateKey('0xdeadbeef'),
        throwsArgumentError,
      );
    });
  });

  group('vault kind', () {
    test('tells a phrase from a raw key by looking at it', () {
      final imported = vectors['privateKeyImport'] as Map<String, dynamic>;

      expect(Vault.read(mnemonic).kind, VaultKind.mnemonic);
      expect(
        Vault.read(imported['privateKey'] as String).kind,
        VaultKind.privateKey,
      );
      expect(
        Vault.read(' ${imported['privateKey']} ').kind,
        VaultKind.privateKey,
      );
    });

    test('only a mnemonic wallet can grow past one account', () {
      final imported = vectors['privateKeyImport'] as Map<String, dynamic>;

      expect(Vault.read(mnemonic).derivable, isTrue);
      expect(Vault.read(imported['privateKey'] as String).derivable, isFalse);
    });

    test('a private-key wallet ignores the derivation index', () {
      final imported = vectors['privateKeyImport'] as Map<String, dynamic>;
      final vault = Vault.read(imported['privateKey'] as String);

      expect(HdWallet.addressOf(vault, 0), imported['address']);
      expect(HdWallet.addressOf(vault, 7), imported['address']);
    });

    test('a mnemonic wallet honours it', () {
      final vault = Vault.read(mnemonic);
      final accounts = (hd['accounts'] as List<dynamic>)
          .cast<Map<String, dynamic>>();

      expect(HdWallet.addressOf(vault, 0), accounts[0]['address']);
      expect(HdWallet.addressOf(vault, 2), accounts[2]['address']);
    });
  });
}
