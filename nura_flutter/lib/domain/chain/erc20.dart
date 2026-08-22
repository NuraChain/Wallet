import 'dart:typed_data';

import 'package:web3dart/crypto.dart' show bytesToHex;
import 'package:web3dart/web3dart.dart';

/// The slice of ERC-20 this wallet actually uses.
///
/// Deliberately not the full standard. The Tauri build reads a token's name, symbol, decimals and
/// balance and writes exactly one method — `transfer` — so that is what is declared here. An ABI
/// listing methods the app never calls is a larger surface to get wrong for no benefit.
///
/// Encoding goes through web3dart's ABI codec rather than hand-assembled selectors: the selector is
/// the first four bytes of `keccak256` over the canonical signature, and the canonical signature has
/// rules (no argument names, no spaces, tuples flattened) that are easy to get subtly wrong.
class Erc20 {
  Erc20() : _abi = ContractAbi.fromJson(_abiJson, 'ERC20');

  final ContractAbi _abi;

  ContractFunction _function(String name) =>
      _abi.functions.firstWhere((f) => f.name == name);

  /// Calldata for `transfer(address,uint256)`.
  ///
  /// [amount] is in the token's smallest unit. Converting from a human figure is the caller's job
  /// and depends on the token's own `decimals` — doing it here would invite a silent factor of
  /// 10^18 in either direction.
  Uint8List encodeTransfer(EthereumAddress to, BigInt amount) =>
      _function('transfer').encodeCall(<dynamic>[to, amount]);

  Uint8List encodeBalanceOf(EthereumAddress owner) =>
      _function('balanceOf').encodeCall(<dynamic>[owner]);

  Uint8List encodeDecimals() =>
      _function('decimals').encodeCall(const <dynamic>[]);

  Uint8List encodeSymbol() => _function('symbol').encodeCall(const <dynamic>[]);

  Uint8List encodeName() => _function('name').encodeCall(const <dynamic>[]);

  /// Decodes a single-value return, which is every read above.
  List<dynamic> decode(String name, Uint8List data) =>
      _function(name).decodeReturnValues(bytesToHex(data, include0x: true));

  static const String _abiJson = '''
[
  {"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"type":"function"},
  {"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"type":"function"},
  {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"type":"function"},
  {"constant":true,"inputs":[{"name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},
  {"constant":false,"inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"type":"function"}
]
''';
}
