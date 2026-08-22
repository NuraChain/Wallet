import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nura_wallet/application/network_controller.dart';
import 'package:nura_wallet/data/repositories/balance_repository.dart';
import 'package:nura_wallet/data/rpc/json_rpc_client.dart';
import 'package:nura_wallet/data/storage/app_store.dart';
import 'package:nura_wallet/data/storage/legacy_store.dart';
import 'package:nura_wallet/domain/chain/network.dart';

/// Answers `eth_getBalance` and `eth_call` from a fixed table, so the repository can be exercised
/// without a live chain.
http.Client _chain({
  String balance = '0x14d1120d7b160000',
  Map<String, String> calls = const <String, String>{},
}) {
  return MockClient((request) async {
    final body = jsonDecode(request.body) as Map<String, dynamic>;
    final method = body['method'] as String;

    Object? result;

    if (method == 'eth_getBalance') {
      result = balance;
    } else if (method == 'eth_call') {
      final params =
          (body['params'] as List<dynamic>).first as Map<String, dynamic>;
      final selector = (params['data'] as String).substring(2, 10);

      result = calls[selector];
    }

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

/// ABI-encodes a uint256 return value.
String _uint(int value) => '0x${value.toRadixString(16).padLeft(64, '0')}';

/// ABI-encodes a string return value: offset, length, then the padded bytes.
String _string(String value) {
  final bytes = utf8.encode(value);
  final padded = <int>[
    ...bytes,
    ...List<int>.filled(32 - bytes.length % 32, 0),
  ];

  return '0x'
      '${(32).toRadixString(16).padLeft(64, '0')}'
      '${bytes.length.toRadixString(16).padLeft(64, '0')}'
      '${padded.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}';
}

void main() {
  group('Network', () {
    test('ships the three built-in chains, Nura first', () {
      expect(defaultNetworks.length, 3);
      expect(defaultNetworks.first.id, 'nura');
      expect(defaultNetworks.first.chainId, nuraChainId);
      expect(nuraChainId, 1020);
    });

    test('endpoints are the primary followed by its backups', () {
      final ethereum = defaultNetworks.firstWhere((n) => n.id == 'ethereum');

      expect(ethereum.endpoints.first, 'https://ethereum.publicnode.com');
      expect(ethereum.endpoints.length, 5);
    });

    test('chain id renders as minimal hex', () {
      expect(defaultNetworks.first.chainIdHex, '0x3fc');
      expect(
        defaultNetworks.firstWhere((n) => n.chainId == 1).chainIdHex,
        '0x1',
      );
    });

    test('the coin name falls back to the chain name', () {
      expect(defaultNetworks.first.coinName, 'Nura Coin');
      expect(
        defaultNetworks.firstWhere((n) => n.id == 'ethereum').coinName,
        'Ethereum',
      );
    });

    test('the explorer API falls back to the explorer /api path', () {
      const guessed = Network(
        id: 'x',
        name: 'X',
        chainId: 9,
        symbol: 'X',
        rpcUrl: 'https://rpc.example',
        explorerUrl: 'https://explorer.example/',
      );

      expect(guessed.explorerApiBase, 'https://explorer.example/api');
    });

    test(
      'an explorer key is folded into the base with the right separator',
      () {
        const withQuery = Network(
          id: 'x',
          name: 'X',
          chainId: 9,
          symbol: 'X',
          rpcUrl: 'https://rpc.example',
          explorerApi: 'https://api.example/v2/api?chainid=9',
          explorerKey: 'abc 123',
        );

        expect(withQuery.explorerApiBase, contains('&apikey=abc%20123'));

        const withoutQuery = Network(
          id: 'y',
          name: 'Y',
          chainId: 9,
          symbol: 'Y',
          rpcUrl: 'https://rpc.example',
          explorerApi: 'https://api.example/api',
          explorerKey: 'k',
        );

        expect(withoutQuery.explorerApiBase, endsWith('?apikey=k'));
      },
    );

    test('round-trips through JSON', () {
      final original = defaultNetworks.last;
      final revived = Network.fromJson(
        jsonDecode(jsonEncode(original.toJson())) as Map<String, dynamic>,
      )!;

      expect(revived.id, original.id);
      expect(revived.chainId, original.chainId);
      expect(revived.rpcBackups, original.rpcBackups);
      expect(revived.explorerApi, original.explorerApi);
    });

    test('an unusable entry is dropped, not thrown on', () {
      expect(Network.fromJson(<String, dynamic>{'id': 'x'}), isNull);

      // One good row and one broken row: the good one survives.
      final list = Network.decodeList(
        jsonEncode(<dynamic>[
          <String, dynamic>{'nope': true},
          defaultNetworks.first.toJson(),
        ]),
      );

      expect(list.length, 1);
      expect(list.first.id, 'nura');
    });

    test('a network stored before backups existed still reads', () {
      final revived = Network.fromJson(<String, dynamic>{
        'id': 'custom-9',
        'name': 'Old',
        'chainId': 9,
        'symbol': 'O',
        'rpcUrl': 'https://rpc.example',
      })!;

      expect(revived.rpcBackups, isEmpty);
      expect(revived.decimals, 18);
    });
  });

  group('NetworkController', () {
    late Directory root;

    setUp(() async {
      root = await Directory.systemTemp.createTemp('nura-network-test');
    });

    tearDown(() async {
      if (root.existsSync()) {
        await root.delete(recursive: true);
      }
    });

    Future<AppStore> store() =>
        AppStore.open(directory: root, legacyCandidates: const <File>[]);

    test('opens on Nura Chain', () async {
      final controller = NetworkController(await store());

      expect(controller.active.id, 'nura');
      expect(controller.all.length, 3);
    });

    test('reads the network the Tauri build was left on', () async {
      final open = await store();
      await open.setString(LegacyStore.keyNetwork, 'bnb');

      expect(NetworkController(open).active.id, 'bnb');
    });

    test(
      'an unknown stored id falls back rather than leaving no network',
      () async {
        final open = await store();
        await open.setString(LegacyStore.keyNetwork, 'chain-that-went-away');

        expect(NetworkController(open).active.id, 'nura');
      },
    );

    test('adding a custom chain activates and persists it', () async {
      final open = await store();
      final controller = NetworkController(open);

      await controller.add(
        const Network(
          id: '',
          name: 'Local',
          chainId: 31337,
          symbol: 'ETH',
          rpcUrl: 'https://rpc.example',
        ),
      );

      expect(controller.active.id, 'custom-31337');
      expect(controller.active.custom, isTrue);

      // A fresh controller over the same store sees it, as a restart would.
      final again = NetworkController(await store());

      expect(again.all.any((n) => n.id == 'custom-31337'), isTrue);
      expect(again.active.id, 'custom-31337');
    });

    test('re-adding the same chain replaces rather than duplicates', () async {
      final controller = NetworkController(await store());

      await controller.add(
        const Network(
          id: '',
          name: 'First',
          chainId: 31337,
          symbol: 'E',
          rpcUrl: 'https://one.example',
        ),
      );
      await controller.add(
        const Network(
          id: '',
          name: 'Second',
          chainId: 31337,
          symbol: 'E',
          rpcUrl: 'https://two.example',
        ),
      );

      expect(controller.all.where((n) => n.chainId == 31337).length, 1);
      expect(controller.active.name, 'Second');
    });

    test('removing the active custom chain falls back to a built-in', () async {
      final controller = NetworkController(await store());

      await controller.add(
        const Network(
          id: '',
          name: 'Local',
          chainId: 31337,
          symbol: 'E',
          rpcUrl: 'https://rpc.example',
        ),
      );

      await controller.remove('custom-31337');

      expect(controller.active.id, 'nura');
      expect(controller.all.length, 3);
    });

    test('built-in networks cannot be removed', () async {
      final controller = NetworkController(await store());

      await controller.remove('nura');

      expect(controller.all.length, 3);
    });

    test(
      'the client is reused per chain but replaced when its endpoints change',
      () async {
        final controller = NetworkController(await store());

        final first = controller.client;

        expect(identical(controller.client, first), isTrue);

        await controller.add(
          const Network(
            id: '',
            name: 'Local',
            chainId: 31337,
            symbol: 'E',
            rpcUrl: 'https://one.example',
          ),
        );
        final custom = controller.client;

        await controller.add(
          const Network(
            id: '',
            name: 'Local',
            chainId: 31337,
            symbol: 'E',
            rpcUrl: 'https://two.example',
          ),
        );

        expect(
          identical(controller.client, custom),
          isFalse,
          reason: 'a replaced endpoint must not keep serving the old client',
        );
      },
    );

    test(
      'a corrupt stored list costs the custom chains, not the app',
      () async {
        final open = await store();
        await open.setString(LegacyStore.keyNetworks, 'not json');

        final controller = NetworkController(open);

        expect(controller.all.length, 3);
        expect(controller.active.id, 'nura');
      },
    );
  });

  group('BalanceRepository', () {
    BalanceRepository build(http.Client client) => BalanceRepository(
      JsonRpcClient(
        endpoints: const <String>['https://rpc.example'],
        networkName: 'Nura Chain',
        client: client,
      ),
      defaultNetworks.first,
    );

    test('reads the native balance', () async {
      final reading = await build(_chain()).native('0xAbC');

      expect(reading.raw, BigInt.parse('1500000000000000000'));
      expect(reading.formatted, '1.5');
      expect(reading.symbol, 'Nura');
    });

    test('formats without going through a double', () {
      // 18 decimals does not fit in a double; this exact value is the one that proves it.
      final reading = BalanceReading(
        raw: BigInt.parse('1234567890123456789'),
        decimals: 18,
        symbol: 'X',
        at: DateTime.now(),
      );

      expect(reading.formatted, '1.234567890123456789');
    });

    test('display truncates rather than rounds', () {
      final reading = BalanceReading(
        raw: BigInt.parse('999999999999999999'),
        decimals: 18,
        symbol: 'X',
        at: DateTime.now(),
      );

      // Rounding would print "1", which is a balance the user does not have.
      expect(reading.display(), '0.999999');
    });

    test('a whole balance carries no decimal point', () {
      final reading = BalanceReading(
        raw: BigInt.from(10).pow(18) * BigInt.from(7),
        decimals: 18,
        symbol: 'X',
        at: DateTime.now(),
      );

      expect(reading.formatted, '7');
      expect(reading.display(), '7');
    });

    test('reads a token in one round of calls', () async {
      final repository = build(
        _chain(
          calls: <String, String>{
            '70a08231': _uint(2500000), // balanceOf
            '313ce567': _uint(6), // decimals
            '95d89b41': _string('USDC'), // symbol
            '06fdde03': _string('USD Coin'), // name
          },
        ),
      );

      final token = await repository.token(
        '0x3222222222222222222222222222222222222222',
        '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      );

      expect(token.symbol, 'USDC');
      expect(token.name, 'USD Coin');
      expect(token.balance.formatted, '2.5');
      expect(token.address, '0x3222222222222222222222222222222222222222');
    });

    // A balance that could not be read is not a balance of zero, and the repository must not turn
    // one into the other.
    test('an unreachable chain surfaces rather than reading as zero', () async {
      final repository = build(
        MockClient((_) async => throw http.ClientException('down')),
      );

      expect(
        repository.native('0xAbC'),
        throwsA(isA<RpcUnreachableException>()),
      );
    });

    test('a node error surfaces as a node error', () async {
      final repository = build(
        MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'jsonrpc': '2.0',
              'id': 1,
              'error': <String, dynamic>{'code': -32000, 'message': 'busy'},
            }),
            200,
          ),
        ),
      );

      expect(repository.native('0xAbC'), throwsA(isA<RpcErrorException>()));
    });
  });
}
