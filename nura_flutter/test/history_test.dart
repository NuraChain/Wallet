import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nura_wallet/data/repositories/history_repository.dart';
import 'package:nura_wallet/domain/chain/network.dart';
import 'package:nura_wallet/domain/chain/token.dart';

const String _me = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const String _other = '0x3222222222222222222222222222222222222222';

Map<String, dynamic> _nativeRow({
  String value = '1500000000000000000',
  String stamp = '1700000000',
  String to = _me,
}) => <String, dynamic>{
  'hash': '0xaaa',
  'from': _other,
  'to': to,
  'value': value,
  'timeStamp': stamp,
};

Map<String, dynamic> _tokenRow({String stamp = '1700000100'}) =>
    <String, dynamic>{
      'hash': '0xbbb',
      'from': _me,
      'to': _other,
      'value': '2500000',
      'timeStamp': stamp,
      'tokenSymbol': 'USDC',
      'tokenDecimal': '6',
    };

/// Answers each explorer action from a table.
http.Client _explorer(Map<String, Object?> byAction, {int status = 200}) {
  return MockClient((request) async {
    final action = request.url.queryParameters['action'];

    return http.Response(
      jsonEncode(<String, dynamic>{
        'status': '1',
        'message': 'OK',
        'result': byAction[action] ?? <dynamic>[],
      }),
      status,
    );
  });
}

void main() {
  group('TokenMap', () {
    const usdc = Token(
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    );

    test('keeps tokens apart by chain', () {
      final map = const TokenMap.empty().add(1, usdc);

      expect(map.forChain(1).length, 1);
      // The same symbol is a different contract elsewhere; one list would show the wrong balance.
      expect(map.forChain(56), isEmpty);
    });

    test('adding the same contract replaces rather than duplicates', () {
      final map = const TokenMap.empty()
          .add(1, usdc)
          .add(
            1,
            const Token(
              address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
              symbol: 'USDC2',
              name: 'x',
              decimals: 6,
            ),
          );

      expect(
        map.forChain(1).length,
        1,
        reason: 'case must not create a second entry',
      );
      expect(map.forChain(1).first.symbol, 'USDC2');
    });

    test('identity ignores checksum casing', () {
      expect(usdc.sameAs(usdc.address.toLowerCase()), isTrue);
      expect(usdc.sameAs(usdc.address.toUpperCase()), isTrue);
      expect(usdc.sameAs(_other), isFalse);
    });

    test('remove works regardless of the casing used', () {
      final map = const TokenMap.empty()
          .add(1, usdc)
          .remove(1, usdc.address.toLowerCase());

      expect(map.forChain(1), isEmpty);
    });

    test('round-trips through the stored shape', () {
      final map = const TokenMap.empty().add(1, usdc).add(56, usdc);
      final revived = TokenMap.decode(map.encode());

      expect(revived.forChain(1).first.symbol, 'USDC');
      expect(revived.forChain(56).first.decimals, 6);
      expect(revived.has(1, usdc.address), isTrue);
    });

    test('a corrupt store costs the tokens, not the wallet', () {
      expect(TokenMap.decode('not json').forChain(1), isEmpty);
      expect(TokenMap.decode('[]').forChain(1), isEmpty);
      expect(TokenMap.decode(null).forChain(1), isEmpty);
    });

    test('an unusable row is dropped and the rest survive', () {
      final raw = jsonEncode(<String, dynamic>{
        '1': <dynamic>[
          <String, dynamic>{'address': 'x'}, // no decimals
          usdc.toJson(),
        ],
      });

      expect(TokenMap.decode(raw).forChain(1).length, 1);
    });
  });

  group('HistoryRepository', () {
    HistoryRepository build(http.Client client) =>
        HistoryRepository(defaultNetworks.first, client: client);

    test('merges native and token transfers, newest first', () async {
      final answer = await build(
        _explorer(<String, Object?>{
          'txlist': <dynamic>[_nativeRow()],
          'tokentx': <dynamic>[_tokenRow()],
        }),
      ).read(_me);

      expect(answer.entries.length, 2);
      // The token row is 100 seconds later, so it leads.
      expect(answer.entries.first.symbol, 'USDC');
      expect(answer.entries.last.symbol, 'Nura');
      expect(answer.notice, isEmpty);
    });

    test('reads direction case-insensitively', () async {
      final answer = await build(
        _explorer(<String, Object?>{
          'txlist': <dynamic>[_nativeRow(to: _me.toLowerCase())],
        }),
      ).read(_me);

      // A case-sensitive match would label the user's own incoming transfer as outgoing.
      expect(answer.entries.single.receivedBy(_me), isTrue);
    });

    test('uses the token decimals, not the chain decimals', () async {
      final answer = await build(
        _explorer(<String, Object?>{
          'tokentx': <dynamic>[_tokenRow()],
        }),
      ).read(_me);

      expect(answer.entries.single.decimals, 6);
      expect(answer.entries.single.value, BigInt.from(2500000));
    });

    // A zero-value native row is a contract call, not a transfer.
    test('drops zero-value native rows', () async {
      final answer = await build(
        _explorer(<String, Object?>{
          'txlist': <dynamic>[_nativeRow(value: '0')],
        }),
      ).read(_me);

      expect(answer.entries, isEmpty);
    });

    test('drops rows that will not parse', () async {
      final answer = await build(
        _explorer(<String, Object?>{
          'txlist': <dynamic>[
            <String, dynamic>{'hash': 0xaaa, 'value': '1', 'timeStamp': '1'},
            <String, dynamic>{'hash': '0xa', 'value': 'lots', 'timeStamp': '1'},
            _nativeRow(),
          ],
        }),
      ).read(_me);

      expect(answer.entries.length, 1);
    });

    // Blockscout's normal empty answer, which must not read as a failure.
    test('an empty result is empty, not an error', () async {
      final answer = await build(
        MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'status': '0',
              'message': 'No transactions found',
              'result': <dynamic>[],
            }),
            200,
          ),
        ),
      ).read(_me);

      expect(answer.entries, isEmpty);
      expect(answer.notice, isEmpty);
    });

    // A refusal carries its explanation in `result` as a string rather than an array.
    test('a refusal is reported with the explorer own words', () async {
      final answer = await build(
        MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'status': '0',
              'message': 'NOTOK',
              'result': 'Max rate limit reached',
            }),
            200,
          ),
        ),
      ).read(_me);

      expect(answer.entries, isEmpty);
      expect(answer.notice, 'Max rate limit reached');
    });

    test('an HTTP failure is reported rather than read as empty', () async {
      final answer = await build(
        MockClient((_) async => http.Response('nope', 503)),
      ).read(_me);

      expect(answer.notice, contains('503'));
    });

    // One action failing must not lose the other.
    test('a failing tokentx still yields native transfers', () async {
      final answer = await build(
        MockClient((request) async {
          if (request.url.queryParameters['action'] == 'tokentx') {
            throw http.ClientException('unsupported');
          }

          return http.Response(
            jsonEncode(<String, dynamic>{
              'status': '1',
              'result': <dynamic>[_nativeRow()],
            }),
            200,
          );
        }),
      ).read(_me);

      expect(answer.entries.length, 1);
      // The notice is suppressed because there *are* rows to show.
      expect(answer.notice, isEmpty);
    });

    test('a network with no explorer says so rather than failing', () async {
      const chain = Network(
        id: 'x',
        name: 'X',
        chainId: 9,
        symbol: 'X',
        rpcUrl: 'https://rpc.example',
      );

      final answer = await HistoryRepository(
        chain,
        client: _explorer(const <String, Object?>{}),
      ).read(_me);

      expect(answer.entries, isEmpty);
      expect(answer.notice, contains('no explorer'));
    });

    test('asks for both actions, newest first, with a bounded page', () async {
      final seen = <String, Map<String, String>>{};

      await build(
        MockClient((request) async {
          seen[request.url.queryParameters['action']!] =
              request.url.queryParameters;

          return http.Response(
            jsonEncode(<String, dynamic>{'result': <dynamic>[]}),
            200,
          );
        }),
      ).read(_me);

      expect(seen.keys.toSet(), <String>{'txlist', 'tokentx'});
      expect(seen['txlist']!['sort'], 'desc');
      expect(seen['txlist']!['offset'], '50');
      expect(seen['txlist']!['address'], _me);
    });
  });
}
