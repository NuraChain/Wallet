import 'dart:convert';
import 'dart:typed_data';

import 'package:web3dart/credentials.dart';
import 'package:web3dart/crypto.dart';

import 'eip712.dart';

/// Signs the two things a dApp can ask this wallet to sign.
///
/// `eth_sign` is deliberately absent and must stay absent. It signs a bare 32-byte digest with no
/// context, so a user approving it cannot see what they are committing to and a malicious site can
/// have them sign a transaction hash. Every major wallet removed it; `dapp.rpc.ts` answers it with
/// EIP-1193 error 4200, and this class gives it nothing to call.
class MessageSigner {
  MessageSigner(this._key);

  factory MessageSigner.fromHex(String privateKey) =>
      MessageSigner(EthPrivateKey.fromHex(privateKey));

  final EthPrivateKey _key;

  String get address => _key.address.hexEip55;

  /// EIP-191 `personal_sign`.
  ///
  /// The payload is bytes, not text. A hex string arriving over the wire is the *encoding* of those
  /// bytes and is decoded before signing — signing the characters `0x48656c…` instead would produce
  /// a valid signature over the wrong message, one no dApp can verify and no user could have
  /// noticed. `signBytes` in `dapp.rpc.ts` makes the same distinction, and the reference vectors
  /// assert that both spellings of one message yield one signature.
  String signPersonalMessage(String payload) {
    return _hex(_key.signPersonalMessageToUint8List(_payloadBytes(payload)));
  }

  /// The bytes `personal_sign` is asked to sign.
  static Uint8List _payloadBytes(String payload) {
    return _isHex(payload)
        ? hexToBytes(payload)
        : Uint8List.fromList(utf8.encode(payload));
  }

  /// A `0x`-prefixed, even-length hex string, matching `ethers.isHexString`.
  ///
  /// Odd-length input is *not* hex here. Padding it would invent a nibble the caller never sent and
  /// silently change the message being signed.
  static bool _isHex(String value) =>
      RegExp(r'^0x([0-9a-fA-F]{2})*$').hasMatch(value);

  /// EIP-712 `eth_signTypedData_v4`.
  ///
  /// The digest is built by [TypedDataEncoder] and signed directly — there is no EIP-191 prefix,
  /// because the `0x1901` prefix inside the digest already serves that purpose.
  ///
  /// It deliberately does *not* go through `EthPrivateKey.signToUint8List`. That method hashes what
  /// it is given — `secp256k1.sign(keccak256(payload))` — which is right for a raw message and wrong
  /// for a digest that is already the hash. Handing it this digest signs `keccak256(digest)` and
  /// produces a signature that is valid, recoverable, and attributable to an address that is not the
  /// signer. The low-level `sign` takes the hash as the hash, which is what EIP-712 requires.
  String signTypedData(
    Map<String, dynamic> domain,
    Map<String, List<TypedDataField>> types,
    Map<String, dynamic> message, {
    String? primaryType,
  }) {
    final hash = TypedDataEncoder.digest(
      domain,
      types,
      message,
      primaryType: primaryType,
    );

    final signature = sign(hash, _key.privateKey);

    // r ‖ s ‖ v, with v as 27/28 — the 65-byte layout every dApp library expects.
    final out = BytesBuilder()
      ..add(_pad32(signature.r))
      ..add(_pad32(signature.s))
      ..addByte(signature.v);

    return _hex(out.toBytes());
  }

  /// A BigInt as exactly 32 big-endian bytes.
  static Uint8List _pad32(BigInt value) {
    final out = Uint8List(32);

    var remaining = value;

    for (var i = 31; i >= 0 && remaining > BigInt.zero; i--) {
      out[i] = (remaining & BigInt.from(0xff)).toInt();
      remaining = remaining >> 8;
    }

    return out;
  }

  /// Reads a typed-data payload as a dApp sends it: a JSON string, or an already-parsed object.
  ///
  /// The chain is checked by the caller, not here — see the note in `dapp.rpc.ts`: the domain
  /// separator is what binds a signature to one network, so a payload for another chain is a
  /// signature that can be replayed there.
  static TypedDataRequest parseRequest(dynamic payload) {
    final decoded = payload is String ? jsonDecode(payload) : payload;

    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('typed data is not an object');
    }

    final domain = decoded['domain'];
    final rawTypes = decoded['types'];
    final message = decoded['message'];

    if (domain is! Map<String, dynamic> ||
        rawTypes is! Map<String, dynamic> ||
        message is! Map<String, dynamic>) {
      throw const FormatException(
        'typed data must carry a domain, types and message',
      );
    }

    final primary = decoded['primaryType'];

    return TypedDataRequest(
      domain: domain,
      types: TypedDataEncoder.fromJson(rawTypes).types,
      message: message,
      primaryType: primary is String && primary.isNotEmpty ? primary : null,
    );
  }

  static String _hex(Uint8List bytes) => '0x${bytesToHex(bytes)}';
}

/// A parsed `eth_signTypedData_v4` request.
class TypedDataRequest {
  const TypedDataRequest({
    required this.domain,
    required this.types,
    required this.message,
    this.primaryType,
  });

  final Map<String, dynamic> domain;
  final Map<String, List<TypedDataField>> types;
  final Map<String, dynamic> message;
  final String? primaryType;

  /// The chain this payload declares, if it declares one.
  ///
  /// `null` means the domain is chain-agnostic and the caller must decide whether it will sign that.
  int? get chainId {
    final value = domain['chainId'];

    if (value == null) return null;
    if (value is int) return value;
    if (value is BigInt) return value.toInt();

    if (value is String) {
      final trimmed = value.trim();

      return trimmed.startsWith('0x')
          ? int.parse(trimmed.substring(2), radix: 16)
          : int.tryParse(trimmed);
    }

    return null;
  }
}
