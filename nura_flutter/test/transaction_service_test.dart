import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nura_wallet/data/rpc/json_rpc_client.dart';
import 'package:nura_wallet/domain/chain/network.dart';
import 'package:nura_wallet/domain/chain/transaction_service.dart';

const String _key =
    '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const String _from = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const String _to = '0x3222222222222222222222222222222222222222';

/// A chain that answers the four preparation reads, recording what it was sent.
http.Client _chain({
  String nonce = '0x7',
  String gasPrice = '0x3b9aca00',
  String estimate = '0x5208',
  String? tip = '0x59682f00',
  List<Map<String, dynamic>>? log,
}) {
  return MockClient((request) async {
    final body = jsonDecode(request.body) as Map<String, dynamic>;
    log?.add(body);

    final method = body['method'] as String;

    if (method == 'eth_maxPriorityFeePerGas' && tip == null) {
      return http.Response(
        jsonEncode(<String, dynamic>{
          'jsonrpc': '2.0',
          'id': 1,
          'error': <String, dynamic>{
            'code': -32601,
            'message': 'method not found',
          },
        }),
        200,
      );
    }

    final result = switch (method) {
      'eth_getTransactionCount' => nonce,
      'eth_gasPrice' => gasPrice,
      'eth_estimateGas' => estimate,
      'eth_maxPriorityFeePerGas' => tip,
      'eth_sendRawTransaction' => '0xhash',
      _ => '0x0',
    };

    return http.Response(
      jsonEncode(<String, dynamic>{
        'jsonrpc': '2.0',
        'id': 1,
        'result': result,
      }),
      200,
    );
  });
}

TransactionService _service(http.Client client) => TransactionService(
  JsonRpcClient(
    endpoints: const <String>['https://rpc.example'],
    networkName: 'Nura Chain',
    client: client,
  ),
  defaultNetworks.first,
);

void main() {
  group('amount parsing', () {
    // The whole reason this is done on the decimal string: 0.1 is not representable in binary
    // floating point, and a wallet that turns "0.1" into 99999999999999999 wei sends the wrong
    // amount.
    test('parses a decimal exactly, without a double', () {
      expect(
        TransactionService.parseAmount('0.1', 18),
        BigInt.parse('100000000000000000'),
      );
      expect(
        TransactionService.parseAmount('1.5', 18),
        BigInt.parse('1500000000000000000'),
      );
      expect(
        TransactionService.parseAmount('0.000000000000000001', 18),
        BigInt.one,
      );
    });

    test('handles whole numbers and a bare leading dot', () {
      expect(
        TransactionService.parseAmount('7', 18),
        BigInt.parse('7000000000000000000'),
      );
      expect(
        TransactionService.parseAmount('.5', 18),
        BigInt.parse('500000000000000000'),
      );
      expect(TransactionService.parseAmount('0', 18), BigInt.zero);
    });

    test('respects the token decimals', () {
      expect(TransactionService.parseAmount('2.5', 6), BigInt.from(2500000));
      expect(TransactionService.parseAmount('1', 0), BigInt.one);
    });

    // Truncating silently would send less than the user typed.
    test('refuses more precision than the token has', () {
      expect(TransactionService.parseAmount('0.1234567', 6), isNull);
    });

    test('refuses anything that is not a plain decimal', () {
      for (final bad in <String>[
        '',
        'abc',
        '1e18',
        '-1',
        '1.2.3',
        '0x10',
        ' ',
      ]) {
        expect(TransactionService.parseAmount(bad, 18), isNull, reason: bad);
      }
    });
  });

  group('validation', () {
    final balance = BigInt.parse('1000000000000000000');

    test('accepts a transfer within the balance', () {
      expect(
        TransactionService.validate(
          recipient: _to,
          amount: '0.5',
          decimals: 18,
          balance: balance,
        ),
        isNull,
      );
    });

    test('rejects a bad address', () {
      expect(
        TransactionService.validate(
          recipient: 'not an address',
          amount: '0.5',
          decimals: 18,
          balance: balance,
        ),
        TransferIssue.invalidAddress,
      );
    });

    test('rejects zero and unparseable amounts', () {
      for (final amount in <String>['0', '', 'abc']) {
        expect(
          TransactionService.validate(
            recipient: _to,
            amount: amount,
            decimals: 18,
            balance: balance,
          ),
          TransferIssue.invalidAmount,
          reason: amount,
        );
      }
    });

    test('rejects more than the balance, and allows exactly the balance', () {
      expect(
        TransactionService.validate(
          recipient: _to,
          amount: '1.000000000000000001',
          decimals: 18,
          balance: balance,
        ),
        TransferIssue.insufficient,
      );

      expect(
        TransactionService.validate(
          recipient: _to,
          amount: '1',
          decimals: 18,
          balance: balance,
        ),
        isNull,
      );
    });
  });

  group('prepare', () {
    test('reads nonce, price and gas from the chain', () async {
      final prepared = await _service(_chain()).prepare(
        from: _from,
        to: _to,
        amount: BigInt.parse('1500000000000000000'),
      );

      expect(prepared.nonce, 7);
      expect(prepared.chainId, nuraChainId);
      // 0x5208 is 21000, plus the 20% margin.
      expect(prepared.gasLimit, BigInt.from(25200));
    });

    test('the fee cap leaves headroom over the observed price', () async {
      final prepared = await _service(_chain())
          .prepare(from: _from, to: _to, amount: BigInt.one);

      // Double the 1 gwei gas price, and never below the tip.
      expect(prepared.maxFeePerGas, BigInt.from(2000000000));
      expect(
        prepared.maxPriorityFeePerGas,
        lessThanOrEqualTo(prepared.maxFeePerGas),
      );
    });

    test('maxFee is the ceiling that can leave the account', () async {
      final prepared = await _service(_chain())
          .prepare(from: _from, to: _to, amount: BigInt.one);

      expect(prepared.maxFee, prepared.gasLimit * prepared.maxFeePerGas);
    });

    // Several chains this ships with do not implement eth_maxPriorityFeePerGas.
    test('falls back when the node has no priority-fee method', () async {
      final prepared = await _service(_chain(tip: null))
          .prepare(from: _from, to: _to, amount: BigInt.one);

      expect(prepared.maxPriorityFeePerGas, BigInt.from(1000000000));
    });

    test('a native transfer carries value and no calldata', () async {
      final log = <Map<String, dynamic>>[];

      await _service(_chain(log: log))
          .prepare(from: _from, to: _to, amount: BigInt.from(1000));

      final estimate = log.firstWhere((e) => e['method'] == 'eth_estimateGas');
      final call =
          (estimate['params'] as List<dynamic>).first as Map<String, dynamic>;

      expect(call['to'], _to);
      expect(call['value'], '0x3e8');
      expect(call.containsKey('data'), isFalse);
    });

    // A token transfer sends no value: the amount rides in the calldata, and putting it in `value`
    // as well would move native coin on top of the tokens.
    test(
      'a token transfer targets the contract and carries calldata',
      () async {
        final log = <Map<String, dynamic>>[];

        await _service(_chain(log: log)).prepare(
          from: _from,
          to: _to,
          amount: BigInt.from(1000),
          token: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
        );

        final estimate = log.firstWhere(
          (e) => e['method'] == 'eth_estimateGas',
        );
        final call =
            (estimate['params'] as List<dynamic>).first as Map<String, dynamic>;

        expect(call['to'], '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC');
        expect(call.containsKey('value'), isFalse);
        expect(call['data'], startsWith('0xa9059cbb'));
        expect(
          call['data'],
          contains('3222222222222222222222222222222222222222'),
        );
      },
    );

    test('asks for the pending nonce, not the latest', () async {
      final log = <Map<String, dynamic>>[];

      await _service(_chain(log: log))
          .prepare(from: _from, to: _to, amount: BigInt.one);

      final count = log.firstWhere(
        (e) => e['method'] == 'eth_getTransactionCount',
      );

      // `latest` would reuse a nonce that an unconfirmed transaction already holds.
      expect((count['params'] as List<dynamic>)[1], 'pending');
    });
  });

  group('send', () {
    test('broadcasts a typed transaction and returns its hash', () async {
      final log = <Map<String, dynamic>>[];
      final service = _service(_chain(log: log));

      final prepared = await service.prepare(
        from: _from,
        to: _to,
        amount: BigInt.parse('1500000000000000000'),
      );

      final hash = await service.send(prepared, _key);

      final broadcast = log.firstWhere(
        (e) => e['method'] == 'eth_sendRawTransaction',
      );
      final raw = (broadcast['params'] as List<dynamic>).first as String;

      // The EIP-2718 envelope byte web3dart omits and the signer restores.
      expect(raw, startsWith('0x02'));
      expect(hash, startsWith('0x'));
      expect(hash.length, 66);
    });

    test(
      'a rejected broadcast surfaces rather than reporting a hash',
      () async {
        final service = _service(
          MockClient((request) async {
            final body = jsonDecode(request.body) as Map<String, dynamic>;

            if (body['method'] == 'eth_sendRawTransaction') {
              return http.Response(
                jsonEncode(<String, dynamic>{
                  'jsonrpc': '2.0',
                  'id': 1,
                  'error': <String, dynamic>{
                    'code': -32000,
                    'message': 'nonce too low',
                  },
                }),
                200,
              );
            }

            return http.Response(
              jsonEncode(<String, dynamic>{
                'jsonrpc': '2.0',
                'id': 1,
                'result': switch (body['method']) {
                  'eth_getTransactionCount' => '0x7',
                  'eth_gasPrice' => '0x3b9aca00',
                  'eth_estimateGas' => '0x5208',
                  _ => '0x59682f00',
                },
              }),
              200,
            );
          }),
        );

        final prepared = await service.prepare(
          from: _from,
          to: _to,
          amount: BigInt.one,
        );

        expect(
          service.send(prepared, _key),
          throwsA(
            isA<RpcErrorException>().having(
              (e) => e.message,
              'message',
              'nonce too low',
            ),
          ),
        );
      },
    );

    test('signing twice produces identical bytes', () async {
      final service = _service(_chain());

      final prepared = await service.prepare(
        from: _from,
        to: _to,
        amount: BigInt.one,
      );

      // The prepared transaction is what gets signed, so the same review yields the same
      // transaction — a confirm that re-derived gas could cost more than the screen showed.
      final first = await service.send(prepared, _key);
      final second = await service.send(prepared, _key);

      expect(first, second);
    });
  });
}
