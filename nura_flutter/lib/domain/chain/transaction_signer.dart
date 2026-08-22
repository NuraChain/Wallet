import 'dart:typed_data';

import 'package:web3dart/crypto.dart' show bytesToHex, keccak256;
import 'package:web3dart/web3dart.dart';

/// Signs an outgoing transaction, offline.
///
/// Signing is separated from broadcasting on purpose. The wallet decides what to sign against an
/// approval the user actually saw; sending it is a network operation that can fail, retry and race,
/// and mixing the two makes it hard to be sure a transaction is signed once and only once.
///
/// EIP-1559 is the default because every chain this wallet ships with supports it. A legacy priced
/// transaction is still produced when the caller supplies `gasPrice` instead — some custom chains a
/// user adds have never activated London, and refusing to sign for them would break those chains
/// rather than protect anyone.
class TransactionSigner {
  const TransactionSigner();

  /// The raw signed transaction, ready for `eth_sendRawTransaction`.
  ///
  /// The `0x02` prefix is added here because web3dart 2.7.3 does not add it. Its
  /// `getUnsignedSerialized` correctly prepends the EIP-2718 type byte when building the hash to
  /// sign, but `signTransactionRaw` returns the signed payload as bare RLP — so the bytes it hands
  /// back are not a typed-transaction envelope at all. A node reading them would try to parse a
  /// London transaction as a legacy one and reject it.
  ///
  /// The signature itself is web3dart's and is correct: with this byte restored, the output is
  /// identical to what ethers produces for the same request, which is what the vector asserts.
  Uint8List sign({
    required EthPrivateKey key,
    required int chainId,
    required Transaction transaction,
  }) {
    // web3dart picks the envelope from the fields present: EIP-1559 when the fee caps are set,
    // legacy when only gasPrice is. Passing both would let it build something that is neither, so
    // the caller is expected to have chosen one — see `transactionRequest` in the dApp router, which
    // makes that choice explicit.
    final signed = signTransactionRaw(transaction, key, chainId: chainId);

    if (!transaction.isEIP1559) {
      return signed;
    }

    return Uint8List.fromList(<int>[_eip1559Type, ...signed]);
  }

  /// The EIP-2718 transaction type for a London fee-market transaction.
  static const int _eip1559Type = 0x02;

  /// The hash the chain will know this transaction by, derived from the signed bytes.
  ///
  /// Computed rather than taken from a node's reply, so the wallet can show a hash immediately and
  /// still be showing the truth if the broadcast is slow or has to be retried.
  String hashOf(Uint8List signed) => '0x${bytesToHex(keccak256(signed))}';

  /// Builds the request from the fields a dApp sends over `eth_sendTransaction`.
  ///
  /// An absent `to` is a contract deployment and stays absent. Everything numeric arrives as a hex
  /// quantity string and is widened to [BigInt] — values here routinely exceed 2^53, so parsing any
  /// of them as `int` would silently truncate an amount or a gas price.
  static Transaction fromRequest({
    required EthereumAddress? to,
    BigInt? value,
    Uint8List? data,
    int? nonce,
    BigInt? gasLimit,
    BigInt? maxFeePerGas,
    BigInt? maxPriorityFeePerGas,
    BigInt? gasPrice,
    EthereumAddress? from,
  }) {
    return Transaction(
      from: from,
      to: to,
      value: EtherAmount.inWei(value ?? BigInt.zero),
      // Empty bytes, never null. web3dart's RLP encoder refuses null outright, and only its
      // *client* path fills this in — signing offline through `signTransactionRaw` does not, so a
      // plain value transfer with no calldata would throw instead of signing.
      data: data ?? Uint8List(0),
      nonce: nonce,
      maxGas: gasLimit?.toInt(),
      maxFeePerGas: maxFeePerGas == null
          ? null
          : EtherAmount.inWei(maxFeePerGas),
      maxPriorityFeePerGas: maxPriorityFeePerGas == null
          ? null
          : EtherAmount.inWei(maxPriorityFeePerGas),
      gasPrice: gasPrice == null ? null : EtherAmount.inWei(gasPrice),
    );
  }
}
