import 'dart:typed_data';

import 'package:web3dart/crypto.dart' show bytesToHex, hexToBytes;
import 'package:web3dart/web3dart.dart';

import '../../domain/chain/erc20.dart';
import '../../domain/chain/network.dart';
import '../rpc/json_rpc_client.dart';

/// A balance, and enough context to render it honestly.
///
/// [at] is when the figure was read. The Tauri build showed it because a stale balance and a fresh
/// one look identical otherwise, and on a wallet that matters: a user seeing yesterday's number
/// after a failed refresh would think a transaction had not landed.
class BalanceReading {
  const BalanceReading({
    required this.raw,
    required this.decimals,
    required this.symbol,
    required this.at,
  });

  final BigInt raw;
  final int decimals;
  final String symbol;
  final DateTime at;

  /// The figure as a decimal string, without trailing noise.
  ///
  /// Formatted from the integer rather than through a double: 18 decimals does not fit in a double,
  /// and rounding a balance is not a cosmetic error.
  String get formatted {
    final unit = BigInt.from(10).pow(decimals);

    final whole = raw ~/ unit;
    final fraction = raw.remainder(unit);

    if (fraction == BigInt.zero) {
      return '$whole';
    }

    final digits = fraction
        .toString()
        .padLeft(decimals, '0')
        .replaceAll(RegExp(r'0+$'), '');

    return '$whole.$digits';
  }

  /// Shortened for display, keeping at most [places] fractional digits.
  ///
  /// Truncates rather than rounds. Rounding up would show a balance the user does not have, and
  /// "0.999999" reading as "1" on a send screen is how someone gets an insufficient-funds error
  /// they cannot explain.
  String display({int places = 6}) {
    final value = formatted;
    final dot = value.indexOf('.');

    if (dot < 0 || value.length - dot - 1 <= places) {
      return value;
    }

    final cut = value
        .substring(0, dot + places + 1)
        .replaceAll(RegExp(r'0+$'), '');

    return cut.endsWith('.') ? cut.substring(0, cut.length - 1) : cut;
  }
}

/// One tracked ERC-20 token.
class TokenBalance {
  const TokenBalance({
    required this.address,
    required this.symbol,
    required this.name,
    required this.balance,
  });

  final String address;
  final String symbol;
  final String name;
  final BalanceReading balance;
}

/// Reads balances off the chain.
///
/// Every call goes through [JsonRpcClient], so failover and the distinction between "the chain said
/// no" and "nothing answered" are handled once rather than per call site. Nothing here catches those
/// exceptions: a balance that could not be read is not a balance of zero, and swallowing the failure
/// here is exactly how it would become one on screen.
class BalanceRepository {
  BalanceRepository(this._client, this._network, {Erc20? erc20})
    : _erc20 = erc20 ?? Erc20();

  final JsonRpcClient _client;
  final Network _network;
  final Erc20 _erc20;

  /// The native coin balance of [address].
  Future<BalanceReading> native(String address) async {
    final raw = await _client.callQuantity('eth_getBalance', <dynamic>[
      address,
      'latest',
    ]);

    return BalanceReading(
      raw: raw,
      decimals: _network.decimals,
      symbol: _network.symbol,
      at: DateTime.now(),
    );
  }

  /// One token's balance, name, symbol and decimals.
  ///
  /// The metadata is read off the contract rather than taken from whoever asked for the token to be
  /// tracked — a site calling `wallet_watchAsset` supplies a symbol, and a symbol chosen by a site
  /// is not a fact about the token.
  ///
  /// The four reads go out together. Issued one after another they would cost four round trips to
  /// draw a single row, and a token list of any length would take visibly longer than it needs to.
  Future<TokenBalance> token(String contract, String owner) async {
    final owned = EthereumAddress.fromHex(owner);

    final results = await Future.wait(<Future<String>>[
      _call(contract, _erc20.encodeBalanceOf(owned)),
      _call(contract, _erc20.encodeDecimals()),
      _call(contract, _erc20.encodeSymbol()),
      _call(contract, _erc20.encodeName()),
    ]);

    final decimals =
        (_erc20.decode('decimals', hexToBytes(results[1])).first as BigInt)
            .toInt();
    final symbol =
        _erc20.decode('symbol', hexToBytes(results[2])).first as String;

    return TokenBalance(
      address: EthereumAddress.fromHex(contract).hexEip55,
      symbol: symbol,
      name: _erc20.decode('name', hexToBytes(results[3])).first as String,
      balance: BalanceReading(
        raw: _erc20.decode('balanceOf', hexToBytes(results[0])).first as BigInt,
        decimals: decimals,
        symbol: symbol,
        at: DateTime.now(),
      ),
    );
  }

  Future<String> _call(String contract, Uint8List data) async {
    final result = await _client.call('eth_call', <dynamic>[
      <String, String>{'to': contract, 'data': '0x${bytesToHex(data)}'},
      'latest',
    ]);

    if (result is! String) {
      throw const RpcErrorException(-32603, 'eth_call did not return data');
    }

    return result;
  }
}
