import 'package:flutter/foundation.dart';

import '../data/repositories/balance_repository.dart';
import '../data/rpc/json_rpc_client.dart';
import '../data/storage/app_store.dart';
import '../data/storage/legacy_store.dart';
import '../domain/chain/network.dart';
import '../domain/chain/token.dart';

/// Why a token could not be added.
enum TokenIssue { alreadyTracked, notAToken }

/// The tokens the wallet tracks, and their live balances.
///
/// The tracked list is a record of intent and is persisted; the balances are read fresh and are
/// never stored. That separation is what the Tauri build had, and it matters: a cached balance
/// written to disk would be shown after a transfer that already invalidated it.
class TokenController extends ChangeNotifier {
  TokenController(this._store)
    : _tracked = TokenMap.decode(_store.getString(LegacyStore.keyTokens));

  final AppStore _store;

  TokenMap _tracked;

  final Map<String, TokenBalance> _balances = <String, TokenBalance>{};

  bool _loading = false;
  int _generation = 0;

  bool get isLoading => _loading;

  List<Token> tracked(int chainId) => _tracked.forChain(chainId);

  /// The last read balance for a contract, or null when it has not been read yet.
  TokenBalance? balanceOf(int chainId, String address) =>
      _balances['$chainId|${address.toLowerCase()}'];

  /// Reads every tracked token's balance for one account.
  ///
  /// The reads go out together rather than in sequence: a list of ten tokens issued serially would
  /// take ten round trips to draw, and they do not depend on each other.
  ///
  /// A token that fails to read is left with whatever it had rather than dropped from the list. A
  /// row vanishing because one call failed reads as the token being gone.
  Future<void> loadBalances(
    Network network,
    JsonRpcClient client,
    String address,
  ) async {
    final tokens = tracked(network.chainId);

    if (tokens.isEmpty) {
      return;
    }

    final generation = ++_generation;

    _loading = true;

    notifyListeners();

    final repository = BalanceRepository(client, network);

    await Future.wait(
      tokens.map((token) async {
        try {
          final balance = await repository.token(token.address, address);

          if (generation == _generation) {
            _balances['${network.chainId}|${token.address.toLowerCase()}'] =
                balance;
          }
        } on RpcErrorException {
          // A contract that will not answer keeps its previous figure.
        } on RpcUnreachableException {
          // Same: an unreachable chain is not a balance of zero.
        }
      }),
    );

    if (generation != _generation) {
      return;
    }

    _loading = false;

    notifyListeners();
  }

  /// Adds a token after reading its metadata off the contract.
  ///
  /// Nothing about the token is taken on trust: the name, symbol and decimals come from the chain,
  /// so an address that is not a readable ERC-20 is refused here rather than appearing as an empty
  /// row that never resolves.
  Future<TokenIssue?> add(
    Network network,
    JsonRpcClient client,
    String contract,
    String owner,
  ) async {
    if (_tracked.has(network.chainId, contract.trim())) {
      return TokenIssue.alreadyTracked;
    }

    final TokenBalance read;

    try {
      read = await BalanceRepository(
        client,
        network,
      ).token(contract.trim(), owner);
    } on Object {
      return TokenIssue.notAToken;
    }

    _tracked = _tracked.add(
      network.chainId,
      Token(
        address: read.address,
        symbol: read.symbol,
        name: read.name,
        decimals: read.balance.decimals,
      ),
    );

    _balances['${network.chainId}|${read.address.toLowerCase()}'] = read;

    await _persist();

    return null;
  }

  Future<void> remove(int chainId, String address) async {
    _tracked = _tracked.remove(chainId, address);
    _balances.remove('$chainId|${address.toLowerCase()}');

    await _persist();
  }

  Future<void> _persist() async {
    await _store.setString(LegacyStore.keyTokens, _tracked.encode());

    notifyListeners();
  }
}
