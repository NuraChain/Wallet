import 'dart:typed_data';

import 'package:web3dart/crypto.dart' show bytesToHex;
import 'package:web3dart/web3dart.dart';

import '../../data/rpc/json_rpc_client.dart';
import 'erc20.dart';
import 'network.dart';
import 'transaction_signer.dart';

/// What a transfer will cost and what it will look like, before anything is signed.
///
/// Produced by [TransactionService.prepare] so the review screen shows figures the chain actually
/// gave, rather than an estimate the interface invented. Everything the user is asked to confirm is
/// in here, and it is the same object that gets signed — there is no second path where a different
/// value could reach the signer.
class PreparedTransaction {
  const PreparedTransaction({
    required this.transaction,
    required this.chainId,
    required this.gasLimit,
    required this.maxFeePerGas,
    required this.maxPriorityFeePerGas,
    required this.nonce,
  });

  final Transaction transaction;
  final int chainId;
  final BigInt gasLimit;
  final BigInt maxFeePerGas;
  final BigInt maxPriorityFeePerGas;
  final int nonce;

  /// The most this transaction can cost in fees.
  ///
  /// `gasLimit × maxFeePerGas` is a ceiling, not a prediction — the chain refunds the difference
  /// between the base fee and the cap. Showing the ceiling is the honest figure for a confirmation
  /// screen: it is the largest amount that can leave the account.
  BigInt get maxFee => gasLimit * maxFeePerGas;
}

/// Why a transfer cannot be sent.
enum TransferIssue { invalidAddress, invalidAmount, insufficient }

/// Builds, signs and broadcasts transfers.
///
/// Preparing and sending are separate calls, which is what lets the review screen show real gas and
/// real fees before the user commits. It also means the signature is made once, from figures the
/// user saw — not re-derived after they tapped confirm, when a changed gas price could quietly make
/// the transaction cost more than the screen said.
class TransactionService {
  TransactionService(this._client, this._network, {Erc20? erc20})
    : _erc20 = erc20 ?? Erc20();

  final JsonRpcClient _client;
  final Network _network;
  final Erc20 _erc20;

  static const TransactionSigner _signer = TransactionSigner();

  /// Parses an amount in whole units into the chain's smallest unit.
  ///
  /// Done on the decimal string rather than through a double: `0.1` is not representable in binary
  /// floating point, and a wallet that turns "0.1" into 99999999999999999 wei is a wallet that
  /// sends the wrong amount.
  static BigInt? parseAmount(String input, int decimals) {
    final trimmed = input.trim();

    if (trimmed.isEmpty || !RegExp(r'^\d*\.?\d*$').hasMatch(trimmed)) {
      return null;
    }

    final parts = trimmed.split('.');

    if (parts.length > 2) {
      return null;
    }

    final whole = parts[0].isEmpty ? '0' : parts[0];
    final fractionRaw = parts.length == 2 ? parts[1] : '';

    // More decimals than the token has is not representable, and silently truncating would send
    // less than the user typed.
    if (fractionRaw.length > decimals) {
      return null;
    }

    final fraction = fractionRaw.padRight(decimals, '0');

    final value = BigInt.parse('$whole${fraction.isEmpty ? '' : fraction}');

    return value;
  }

  /// Checks a transfer before any network call is made.
  ///
  /// Returns null when it is worth preparing. The balance check is done here as well as by the chain
  /// because a rejected broadcast costs a round trip and gives a worse message than "amount exceeds
  /// your balance".
  static TransferIssue? validate({
    required String recipient,
    required String amount,
    required int decimals,
    required BigInt balance,
  }) {
    if (!_isAddress(recipient)) {
      return TransferIssue.invalidAddress;
    }

    final value = parseAmount(amount, decimals);

    if (value == null || value <= BigInt.zero) {
      return TransferIssue.invalidAmount;
    }

    if (value > balance) {
      return TransferIssue.insufficient;
    }

    return null;
  }

  static bool _isAddress(String value) {
    try {
      EthereumAddress.fromHex(value.trim());

      return true;
    } on Object {
      return false;
    }
  }

  /// Asks the chain for the nonce, the fees and the gas this transfer needs.
  ///
  /// The three reads go out together — they are independent, and issuing them in sequence would put
  /// three round trips between tapping Review and seeing a figure.
  ///
  /// [token] null sends the native coin; otherwise the value rides in ERC-20 `transfer` calldata and
  /// the transaction itself carries no value.
  Future<PreparedTransaction> prepare({
    required String from,
    required String to,
    required BigInt amount,
    String? token,
  }) async {
    final recipient = EthereumAddress.fromHex(to.trim());

    final Uint8List? data = token == null
        ? null
        : _erc20.encodeTransfer(recipient, amount);

    final target = token == null ? recipient : EthereumAddress.fromHex(token);

    final call = <String, String>{
      'from': from,
      'to': target.hexEip55,
      if (token == null) 'value': '0x${amount.toRadixString(16)}',
      if (data != null) 'data': '0x${bytesToHex(data)}',
    };

    final results = await Future.wait(<Future<BigInt>>[
      _client.callQuantity('eth_getTransactionCount', <dynamic>[
        from,
        'pending',
      ]),
      _client.callQuantity('eth_gasPrice'),
      _client.callQuantity('eth_estimateGas', <dynamic>[call]),
    ]);

    final nonce = results[0].toInt();
    final gasPrice = results[1];
    final estimated = results[2];

    // A tip the chain will accept, falling back to the gas price when the node has no
    // `eth_maxPriorityFeePerGas` — several of the chains this ships with do not implement it.
    BigInt tip;

    try {
      tip = await _client.callQuantity('eth_maxPriorityFeePerGas');
    } on RpcErrorException {
      tip = gasPrice;
    }

    // Headroom over the current price so the transaction still lands if the base fee rises between
    // preparing and broadcasting. Twice the observed price is what most wallets use; the surplus is
    // refunded rather than spent.
    final maxFee = gasPrice * BigInt.two > tip ? gasPrice * BigInt.two : tip;

    // A margin on the estimate for the same reason: `eth_estimateGas` is exact for the state it
    // simulated against, and a contract whose storage changes before inclusion can need slightly
    // more. Unused gas is not charged.
    final gasLimit = estimated + (estimated ~/ BigInt.from(5));

    return PreparedTransaction(
      chainId: _network.chainId,
      nonce: nonce,
      gasLimit: gasLimit,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: tip > maxFee ? maxFee : tip,
      transaction: TransactionSigner.fromRequest(
        from: EthereumAddress.fromHex(from),
        to: target,
        value: token == null ? amount : BigInt.zero,
        data: data,
        nonce: nonce,
        gasLimit: gasLimit,
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: tip > maxFee ? maxFee : tip,
      ),
    );
  }

  /// Signs and broadcasts, returning the transaction hash.
  ///
  /// The hash is computed from the signed bytes rather than taken from the node's reply. Both should
  /// agree; computing it means the wallet can show the hash even if the broadcast has to be retried,
  /// and it does not depend on a node returning the field.
  Future<String> send(PreparedTransaction prepared, String privateKey) async {
    final signed = _signer.sign(
      key: EthPrivateKey.fromHex(privateKey),
      chainId: prepared.chainId,
      transaction: prepared.transaction,
    );

    await _client.call('eth_sendRawTransaction', <dynamic>[
      '0x${bytesToHex(signed)}',
    ]);

    return _signer.hashOf(signed);
  }
}
