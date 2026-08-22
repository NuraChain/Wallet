import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/domain/chain/erc20.dart';
import 'package:nura_wallet/domain/chain/transaction_signer.dart';
import 'package:web3dart/crypto.dart' show bytesToHex;
import 'package:web3dart/web3dart.dart';

Map<String, dynamic> _vectors() =>
    jsonDecode(File('test/vectors/reference_vectors.json').readAsStringSync())
        as Map<String, dynamic>;

void main() {
  final vectors = _vectors();

  group('EIP-1559 transaction', () {
    final tx = vectors['transaction'] as Map<String, dynamic>;
    final request = tx['request'] as Map<String, dynamic>;

    final key = EthPrivateKey.fromHex(
      (vectors['privateKeyImport'] as Map<String, dynamic>)['privateKey']
          as String,
    );

    const signer = TransactionSigner();

    Transaction build() => TransactionSigner.fromRequest(
      to: EthereumAddress.fromHex(request['to'] as String),
      value: BigInt.parse(request['value'] as String),
      nonce: request['nonce'] as int,
      gasLimit: BigInt.parse(request['gasLimit'] as String),
      maxFeePerGas: BigInt.parse(request['maxFeePerGas'] as String),
      maxPriorityFeePerGas: BigInt.parse(
        request['maxPriorityFeePerGas'] as String,
      ),
    );

    test('produces the same signed bytes as ethers', () {
      final signed = signer.sign(
        key: key,
        chainId: request['chainId'] as int,
        transaction: build(),
      );

      expect('0x${bytesToHex(signed)}', tx['signedRaw']);
    });

    test('derives the same transaction hash', () {
      final signed = signer.sign(
        key: key,
        chainId: request['chainId'] as int,
        transaction: build(),
      );

      expect(signer.hashOf(signed), tx['hash']);
    });

    // The chain id is inside the signed payload for a typed transaction, so signing for the wrong
    // chain is not a recoverable mistake — it is a transaction that is only valid somewhere else.
    test('a different chain id changes the signature', () {
      final onNura = signer.sign(
        key: key,
        chainId: request['chainId'] as int,
        transaction: build(),
      );
      final onMainnet = signer.sign(key: key, chainId: 1, transaction: build());

      expect(bytesToHex(onNura), isNot(bytesToHex(onMainnet)));
    });

    test('a contract deployment keeps an absent recipient', () {
      final deployment = TransactionSigner.fromRequest(
        to: null,
        value: BigInt.zero,
        nonce: 0,
        gasLimit: BigInt.from(100000),
        maxFeePerGas: BigInt.from(30000000000),
        maxPriorityFeePerGas: BigInt.from(1500000000),
      );

      expect(deployment.to, isNull);
      expect(
        signer
            .sign(key: key, chainId: 1020, transaction: deployment)
            .isNotEmpty,
        isTrue,
      );
    });

    test('an omitted value defaults to zero rather than null', () {
      expect(
        TransactionSigner.fromRequest(to: null).value,
        EtherAmount.inWei(BigInt.zero),
      );
    });
  });

  group('ERC-20 encoding', () {
    final erc20 = vectors['erc20Transfer'] as Map<String, dynamic>;
    final token = Erc20();

    test('transfer calldata matches ethers', () {
      final data = token.encodeTransfer(
        EthereumAddress.fromHex(erc20['to'] as String),
        BigInt.parse(erc20['amount'] as String),
      );

      expect(bytesToHex(data, include0x: true), erc20['calldata']);
    });

    test('the selector is the first four bytes of the signature hash', () {
      final data = token.encodeTransfer(
        EthereumAddress.fromHex(erc20['to'] as String),
        BigInt.one,
      );

      // a9059cbb is the well-known transfer(address,uint256) selector.
      expect(bytesToHex(data).substring(0, 8), 'a9059cbb');
    });

    test('reads encode to a bare selector with their argument', () {
      expect(bytesToHex(token.encodeDecimals()).length, 8);
      expect(bytesToHex(token.encodeSymbol()).length, 8);
      expect(bytesToHex(token.encodeName()).length, 8);
      expect(
        bytesToHex(
          token.encodeBalanceOf(EthereumAddress.fromHex(erc20['to'] as String)),
        ).length,
        8 + 64,
      );
    });
  });

  group('EIP-55 checksum', () {
    test('matches ethers for every case', () {
      for (final entry
          in (vectors['checksum'] as Map<String, dynamic>)['cases']
              as List<dynamic>) {
        final row = entry as Map<String, dynamic>;

        expect(
          EthereumAddress.fromHex(row['lower'] as String).hexEip55,
          row['checksummed'],
        );
      }
    });
  });
}
