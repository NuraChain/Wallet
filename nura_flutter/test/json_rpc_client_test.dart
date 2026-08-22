import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nura_wallet/data/rpc/json_rpc_client.dart';

/// Records which endpoints were asked, so failover order can be asserted and not merely assumed.
class _Recorder {
  final List<String> asked = <String>[];
}

http.Client _mock(
  _Recorder recorder,
  Future<http.Response> Function(String host, Map<String, dynamic> body) reply,
) {
  return MockClient((request) async {
    recorder.asked.add(request.url.host);

    return reply(
      request.url.host,
      jsonDecode(request.body) as Map<String, dynamic>,
    );
  });
}

http.Response _result(Object? value) => http.Response(
  jsonEncode(<String, dynamic>{'jsonrpc': '2.0', 'id': 1, 'result': value}),
  200,
);

http.Response _error(int code, String message) => http.Response(
  jsonEncode(<String, dynamic>{
    'jsonrpc': '2.0',
    'id': 1,
    'error': <String, dynamic>{'code': code, 'message': message},
  }),
  200,
);

void main() {
  group('JSON-RPC failover', () {
    test('uses the first endpoint when it answers', () async {
      final recorder = _Recorder();

      final client = JsonRpcClient(
        endpoints: const ['https://one.example', 'https://two.example'],
        networkName: 'Nura Chain',
        client: _mock(recorder, (host, body) async => _result('0x3fc')),
      );

      expect(await client.call('eth_chainId'), '0x3fc');
      expect(recorder.asked, <String>['one.example']);
    });

    test('falls through to the next endpoint on a transport failure', () async {
      final recorder = _Recorder();

      final client = JsonRpcClient(
        endpoints: const ['https://dead.example', 'https://alive.example'],
        networkName: 'Nura Chain',
        client: _mock(recorder, (host, body) async {
          if (host == 'dead.example') {
            throw http.ClientException('connection refused');
          }

          return _result('0x2a');
        }),
      );

      expect(await client.call('eth_blockNumber'), '0x2a');
      expect(recorder.asked, <String>['dead.example', 'alive.example']);
    });

    test('treats a non-2xx response as a transport failure', () async {
      final recorder = _Recorder();

      final client = JsonRpcClient(
        endpoints: const ['https://limited.example', 'https://alive.example'],
        networkName: 'Nura Chain',
        client: _mock(recorder, (host, body) async {
          // A rate-limited public node is exactly the case failover exists for.
          return host == 'limited.example'
              ? http.Response('rate limited', 429)
              : _result('0x1');
        }),
      );

      expect(await client.call('eth_blockNumber'), '0x1');
      expect(recorder.asked.length, 2);
    });

    test('treats an unparseable body as a transport failure', () async {
      final recorder = _Recorder();

      final client = JsonRpcClient(
        endpoints: const ['https://html.example', 'https://alive.example'],
        networkName: 'Nura Chain',
        client: _mock(recorder, (host, body) async {
          // A captive portal or proxy answering with HTML, which is not a chain speaking.
          return host == 'html.example'
              ? http.Response('<html>hello</html>', 200)
              : _result('0x1');
        }),
      );

      expect(await client.call('eth_blockNumber'), '0x1');
      expect(recorder.asked.length, 2);
    });

    // The rule that keeps one honest revert from becoming a scan of every endpoint.
    test('a JSON-RPC error is final and is not retried elsewhere', () async {
      final recorder = _Recorder();

      final client = JsonRpcClient(
        endpoints: const [
          'https://one.example',
          'https://two.example',
          'https://three.example',
        ],
        networkName: 'Nura Chain',
        client: _mock(
          recorder,
          (host, body) async => _error(3, 'execution reverted'),
        ),
      );

      await expectLater(
        client.call('eth_call'),
        throwsA(
          isA<RpcErrorException>()
              .having((e) => e.code, 'code', 3)
              .having((e) => e.message, 'message', 'execution reverted'),
        ),
      );

      expect(recorder.asked, <String>['one.example']);
    });

    test('reports the network as unreachable when nothing answers', () async {
      final recorder = _Recorder();

      final client = JsonRpcClient(
        endpoints: const ['https://a.example', 'https://b.example'],
        networkName: 'Nura Chain',
        client: _mock(recorder, (host, body) async {
          throw http.ClientException('down');
        }),
      );

      await expectLater(
        client.call('eth_blockNumber'),
        throwsA(
          isA<RpcUnreachableException>().having(
            (e) => e.network,
            'network',
            contains('Nura Chain'),
          ),
        ),
      );

      expect(recorder.asked, <String>['a.example', 'b.example']);
    });

    test('gives up on a stalled endpoint and moves on', () async {
      final recorder = _Recorder();

      final client = JsonRpcClient(
        endpoints: const ['https://slow.example', 'https://fast.example'],
        networkName: 'Nura Chain',
        timeout: const Duration(milliseconds: 80),
        client: _mock(recorder, (host, body) async {
          if (host == 'slow.example') {
            await Future<void>.delayed(const Duration(seconds: 5));
          }

          return _result('0x7');
        }),
      );

      expect(await client.call('eth_blockNumber'), '0x7');
      expect(recorder.asked, <String>['slow.example', 'fast.example']);
    });
  });

  group('request shape', () {
    test('sends a well-formed JSON-RPC 2.0 envelope', () async {
      final recorder = _Recorder();
      late Map<String, dynamic> sent;

      final client = JsonRpcClient(
        endpoints: const ['https://one.example'],
        networkName: 'Nura Chain',
        client: _mock(recorder, (host, body) async {
          sent = body;

          return _result('0x0');
        }),
      );

      await client.call('eth_getBalance', <dynamic>['0xabc', 'latest']);

      expect(sent['jsonrpc'], '2.0');
      expect(sent['method'], 'eth_getBalance');
      expect(sent['params'], <dynamic>['0xabc', 'latest']);
      expect(sent['id'], isA<int>());
    });

    test('gives each call a distinct id', () async {
      final recorder = _Recorder();
      final ids = <int>[];

      final client = JsonRpcClient(
        endpoints: const ['https://one.example'],
        networkName: 'Nura Chain',
        client: _mock(recorder, (host, body) async {
          ids.add(body['id'] as int);

          return _result('0x0');
        }),
      );

      await client.call('eth_blockNumber');
      await client.call('eth_blockNumber');

      expect(ids.toSet().length, 2);
    });
  });

  group('quantity decoding', () {
    test('parses a hex quantity beyond 2^53', () async {
      final recorder = _Recorder();

      final client = JsonRpcClient(
        endpoints: const ['https://one.example'],
        networkName: 'Nura Chain',
        client: _mock(
          recorder,
          // 1.5 ETH in wei — well past what a Dart int holds on the web, and the exact class of
          // value that silently truncates if parsed as anything but BigInt.
          (host, body) async => _result('0x14d1120d7b160000'),
        ),
      );

      expect(
        await client.callQuantity('eth_getBalance'),
        BigInt.parse('1500000000000000000'),
      );
    });

    test('refuses a result that is not a hex quantity', () async {
      final recorder = _Recorder();

      final client = JsonRpcClient(
        endpoints: const ['https://one.example'],
        networkName: 'Nura Chain',
        client: _mock(recorder, (host, body) async => _result('not hex')),
      );

      expect(
        client.callQuantity('eth_getBalance'),
        throwsA(isA<RpcErrorException>()),
      );
    });
  });
}
