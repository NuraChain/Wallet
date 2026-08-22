import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../data/rpc/json_rpc_client.dart';
import '../data/storage/app_store.dart';
import '../data/storage/legacy_store.dart';
import '../domain/chain/network.dart';

/// Which chain the wallet is on, and which chains it knows about.
///
/// Custom networks are stored under the same key and in the same JSON shape the Tauri build used, so
/// a user who added a chain there still has it here.
class NetworkController extends ChangeNotifier {
  NetworkController(this._store) {
    _custom = _readCustom();
    _activeId = _readActive();
  }

  final AppStore _store;

  List<Network> _custom = const <Network>[];
  String _activeId = defaultNetworks.first.id;

  /// A client per network, kept so switching chains and back does not leak a new one each time.
  final Map<String, JsonRpcClient> _clients = <String, JsonRpcClient>{};

  /// Every known network: the built-ins, then the user's own.
  List<Network> get all => <Network>[...defaultNetworks, ..._custom];

  /// The active network, falling back to the first built-in if the stored id is unknown.
  Network get active => all.firstWhere(
    (n) => n.id == _activeId,
    orElse: () => defaultNetworks.first,
  );

  /// The RPC client for the active network.
  JsonRpcClient get client => clientFor(active);

  JsonRpcClient clientFor(Network network) {
    // Keyed by id *and* endpoints: re-adding a chain replaces the entry under the same id, so an
    // id-only cache would keep handing back a client aimed at the endpoint that was replaced.
    final key = '${network.id}|${network.endpoints.join(',')}';

    return _clients.putIfAbsent(
      key,
      () => JsonRpcClient(
        endpoints: network.endpoints,
        networkName: network.name,
      ),
    );
  }

  Future<void> select(String id) async {
    if (_activeId == id || !all.any((n) => n.id == id)) {
      return;
    }

    _activeId = id;

    notifyListeners();

    await _store.setString(LegacyStore.keyNetwork, id);
  }

  /// Adds or replaces a custom network and makes it active.
  ///
  /// The id is derived from the chain id, so re-adding the same chain updates the existing entry
  /// rather than producing a second one that would disagree with it.
  Future<Network> add(Network input) async {
    final network = Network(
      id: 'custom-${input.chainId}',
      name: input.name,
      chainId: input.chainId,
      symbol: input.symbol,
      coin: input.coin,
      rpcUrl: input.rpcUrl,
      rpcBackups: input.rpcBackups,
      explorerUrl: input.explorerUrl,
      explorerApi: input.explorerApi,
      explorerKey: input.explorerKey,
      decimals: input.decimals,
      custom: true,
    );

    _custom = <Network>[..._custom.where((n) => n.id != network.id), network];

    await _persist();
    await select(network.id);

    return network;
  }

  /// Removes a custom network. Built-ins are never removable.
  Future<void> remove(String id) async {
    if (!_custom.any((n) => n.id == id)) {
      return;
    }

    _custom = _custom.where((n) => n.id != id).toList();

    await _persist();

    if (_activeId == id) {
      await select(defaultNetworks.first.id);
    } else {
      notifyListeners();
    }
  }

  Future<void> _persist() async {
    await _store.setString(
      LegacyStore.keyNetworks,
      jsonEncode(_custom.map((n) => n.toJson()).toList()),
    );

    notifyListeners();
  }

  List<Network> _readCustom() {
    final raw = _store.getString(LegacyStore.keyNetworks);

    if (raw == null || raw.isEmpty) {
      return const <Network>[];
    }

    try {
      return Network.decodeList(raw);
    } on FormatException {
      // A corrupt list costs the custom chains, not the app. The built-ins are still there and the
      // user can re-add what they had.
      return const <Network>[];
    }
  }

  String _readActive() {
    final stored = _store.getString(LegacyStore.keyNetwork);

    return stored != null && all.any((n) => n.id == stored)
        ? stored
        : defaultNetworks.first.id;
  }

  @override
  void dispose() {
    for (final client in _clients.values) {
      client.close();
    }

    _clients.clear();

    super.dispose();
  }
}
