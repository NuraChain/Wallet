import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// A JSON-RPC error the node itself returned.
///
/// This is an *answer*, not a failure to get one. A reverted `eth_call` arrives this way, and so
/// does "nonce too low" — both are the chain speaking, and both are final.
class RpcErrorException implements Exception {
  const RpcErrorException(this.code, this.message, [this.data]);

  final int code;
  final String message;
  final Object? data;

  @override
  String toString() => 'RpcErrorException($code): $message';
}

/// No endpoint could be reached at all.
///
/// Deliberately distinct from [RpcErrorException]: one means the chain said no, the other means
/// nobody answered. The UI shows very different things for those, and the Tauri build made the same
/// split — a balance read against a dead link is not a balance of zero.
class RpcUnreachableException implements Exception {
  const RpcUnreachableException(this.network);

  final String network;

  @override
  String toString() => 'RpcUnreachableException: could not reach $network';
}

/// Talks to a chain over plain JSON-RPC, with failover across the endpoints a network lists.
///
/// This replaces two separate mechanisms from the Tauri build, deliberately unified. There, reads
/// went through an ethers `FallbackProvider` at quorum one while the dApp router had its own
/// sequential `fetch` loop — two failover policies that could disagree about whether a chain was
/// reachable. One policy is easier to reason about and easier to test.
///
/// The policy, which is the whole point of the class:
///
/// * Endpoints are tried in the order the network lists them. The first is the one normally used;
///   the rest exist for when it does not answer.
/// * A **transport** failure — refused, timed out, non-2xx, unparseable — moves to the next
///   endpoint. A public node that starts rate-limiting should cost latency, not availability.
/// * A **JSON-RPC error** is final and is thrown immediately. Retrying a revert against every
///   endpoint in turn would turn one honest answer into a scan of the whole list before returning
///   exactly the same thing.
///
/// No CORS concerns arise here, unlike in the webview the Tauri build ran inside: a Dart HTTP client
/// has no origin, which is why `request.ts` and its native-client workaround have no counterpart.
class JsonRpcClient {
  JsonRpcClient({
    required this.endpoints,
    required this.networkName,
    http.Client? client,
    this.timeout = const Duration(seconds: 12),
  }) : _client = client ?? http.Client(),
       assert(endpoints.isNotEmpty, 'a network needs at least one endpoint');

  /// In priority order: the primary first, then its fallbacks.
  final List<String> endpoints;

  /// Named only so an unreachable-network message can say which one.
  final String networkName;

  /// Per-endpoint, not per-call. Ten endpoints do not get ten times as long each.
  final Duration timeout;

  final http.Client _client;

  var _id = 0;

  /// Makes one call, returning whatever the node put in `result`.
  Future<dynamic> call(String method, [List<dynamic> params = const []]) async {
    _id += 1;

    final body = jsonEncode(<String, dynamic>{
      'jsonrpc': '2.0',
      'id': _id,
      'method': method,
      'params': params,
    });

    var reached = false;

    for (final endpoint in endpoints) {
      Map<String, dynamic> decoded;

      try {
        final response = await _client
            .post(
              Uri.parse(endpoint),
              headers: const <String, String>{
                'content-type': 'application/json',
              },
              body: body,
            )
            .timeout(timeout);

        if (response.statusCode < 200 || response.statusCode >= 300) {
          continue;
        }

        final parsed = jsonDecode(response.body);

        if (parsed is! Map<String, dynamic>) {
          continue;
        }

        decoded = parsed;
      } on Object {
        // Every transport failure looks the same from here — refused connection, DNS, TLS,
        // timeout, malformed body — and they all mean the same thing: ask the next endpoint.
        continue;
      }

      // Past this point the endpoint has spoken for the chain, so whatever it said is the answer.
      reached = true;

      final error = decoded['error'];

      if (error is Map<String, dynamic>) {
        final code = error['code'];
        final message = error['message'];

        throw RpcErrorException(
          code is int ? code : -32603,
          message is String ? message : 'the node rejected the request',
          error['data'],
        );
      }

      return decoded['result'];
    }

    // Reaching an endpoint that then answered with neither a result nor an error is not the same as
    // reaching none at all, but it is just as unusable, and the caller only needs to know that the
    // chain could not be read.
    throw RpcUnreachableException(
      reached
          ? '$networkName (no endpoint returned a usable answer)'
          : networkName,
    );
  }

  /// A convenience for the many methods whose result is a hex quantity.
  Future<BigInt> callQuantity(
    String method, [
    List<dynamic> params = const [],
  ]) async {
    final result = await call(method, params);

    if (result is! String || !result.startsWith('0x')) {
      throw RpcErrorException(-32603, 'expected a hex quantity from $method');
    }

    return BigInt.parse(result.substring(2), radix: 16);
  }

  void close() => _client.close();
}
