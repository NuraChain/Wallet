import 'package:flutter/foundation.dart';

import '../data/repositories/balance_repository.dart';
import '../data/rpc/json_rpc_client.dart';
import '../domain/chain/network.dart';

/// Why a balance is not on screen.
///
/// The two failures are kept apart all the way to the UI, because they mean different things to a
/// user and call for different words: `unreachable` is "we could not ask", `failed` is "the chain
/// answered badly". Collapsing them into one error would tell someone with no signal that their
/// wallet is broken.
enum BalanceStatus { idle, loading, ready, unreachable, failed }

/// Loads and holds the native balance for one account on one chain.
///
/// A reading is kept across a refresh that fails, and [status] carries the failure alongside it.
/// That is deliberate: clearing the figure on a failed refresh would replace a true-if-stale balance
/// with nothing, and "—" is less useful than "1.5, as of two minutes ago". [BalanceReading.at] is
/// what lets the screen say which it is showing.
class BalanceController extends ChangeNotifier {
  BalanceController();

  BalanceStatus _status = BalanceStatus.idle;
  BalanceReading? _reading;
  String _failure = '';

  /// Guards against a slow response for an account or chain the user has already left.
  int _generation = 0;

  BalanceStatus get status => _status;
  BalanceReading? get reading => _reading;
  String get failure => _failure;

  bool get isLoading => _status == BalanceStatus.loading;

  /// Reads the balance for [address] on [network].
  ///
  /// Switching account or chain while a read is in flight is ordinary — the account switcher is one
  /// tap away from the balance. The generation counter is what makes the late answer land nowhere
  /// instead of overwriting the new account's balance with the old account's number.
  Future<void> load(
    Network network,
    JsonRpcClient client,
    String address, {
    bool silent = false,
  }) async {
    final generation = ++_generation;

    if (!silent) {
      _status = BalanceStatus.loading;

      notifyListeners();
    }

    try {
      final reading = await BalanceRepository(client, network).native(address);

      if (generation != _generation) {
        return;
      }

      _reading = reading;
      _status = BalanceStatus.ready;
      _failure = '';
    } on RpcUnreachableException catch (error) {
      if (generation != _generation) {
        return;
      }

      _status = BalanceStatus.unreachable;
      _failure = error.network;
    } on RpcErrorException catch (error) {
      if (generation != _generation) {
        return;
      }

      _status = BalanceStatus.failed;
      _failure = error.message;
    }

    notifyListeners();
  }

  /// Forgets the current figure, for when the account changes.
  ///
  /// Called on a *deliberate* change rather than on a failure: showing the previous account's
  /// balance under a new address would be wrong in a way the user cannot detect.
  void clear() {
    _generation++;
    _reading = null;
    _status = BalanceStatus.idle;
    _failure = '';

    notifyListeners();
  }
}
