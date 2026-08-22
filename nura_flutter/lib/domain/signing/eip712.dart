import 'dart:convert';
import 'dart:typed_data';

import 'package:web3dart/crypto.dart';

/// One field of an EIP-712 struct: its name and its solidity type.
class TypedDataField {
  const TypedDataField(this.name, this.type);

  final String name;
  final String type;

  factory TypedDataField.fromJson(Map<String, dynamic> json) =>
      TypedDataField(json['name'] as String, json['type'] as String);
}

/// EIP-712 typed structured data, hashed exactly as the specification defines it.
///
/// Written by hand because there is no maintained Dart implementation — `web3dart` stops at
/// EIP-191. That makes this the most safety-critical code in the port: a signature produced over the
/// wrong digest is still a perfectly valid secp256k1 signature, so nothing rejects it at signing
/// time. It goes wrong later, on chain, against whatever the user was actually asked to approve.
///
/// Every step below is the spec's, not an interpretation of it:
///
/// * `encodeType` names the struct and every struct it transitively references, the referenced ones
///   sorted alphabetically after the primary — that ordering is normative, not cosmetic, because the
///   string is hashed.
/// * `encodeData` maps each field to exactly 32 bytes. Dynamic values (`string`, `bytes`) are
///   replaced by their keccak hash, arrays by the hash of their concatenated members, and nested
///   structs by their own `hashStruct`.
/// * The final digest is `keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(primaryType, message))`.
///   The `0x1901` prefix is what stops a signed struct from ever being replayable as a transaction.
///
/// Verified against digests, struct hashes and signatures produced by ethers 6.17 — see
/// `test/eip712_test.dart`.
class TypedDataEncoder {
  TypedDataEncoder(this.types, {String? primaryType})
    : primaryType = primaryType ?? _inferPrimaryType(types);

  /// The struct definitions, with `EIP712Domain` removed if the caller left it in.
  final Map<String, List<TypedDataField>> types;

  final String primaryType;

  /// Reads the `types` object of a JSON typed-data payload.
  ///
  /// `EIP712Domain` is dropped: the domain's own type is derived from which fields the domain
  /// actually carries, so a declaration of it here is redundant and, if it disagrees, wrong.
  factory TypedDataEncoder.fromJson(
    Map<String, dynamic> json, {
    String? primaryType,
  }) {
    final types = <String, List<TypedDataField>>{};

    for (final entry in json.entries) {
      if (entry.key == 'EIP712Domain') {
        continue;
      }

      types[entry.key] = (entry.value as List<dynamic>)
          .map((f) => TypedDataField.fromJson(f as Map<String, dynamic>))
          .toList();
    }

    return TypedDataEncoder(types, primaryType: primaryType);
  }

  /// The type that nothing else refers to.
  ///
  /// EIP-712 payloads normally state their `primaryType`, but plenty of dApps omit it. Ethers infers
  /// it the same way: exactly one struct should sit at the root of the reference graph, and anything
  /// else is a payload this wallet will not guess at.
  static String _inferPrimaryType(Map<String, List<TypedDataField>> types) {
    final referenced = <String>{};

    for (final fields in types.values) {
      for (final field in fields) {
        final base = _baseType(field.type);

        if (types.containsKey(base)) {
          referenced.add(base);
        }
      }
    }

    final roots = types.keys.where((t) => !referenced.contains(t)).toList();

    if (roots.length != 1) {
      throw FormatException(
        roots.isEmpty
            ? 'typed data has no primary type (the types reference each other in a cycle)'
            : 'typed data has an ambiguous primary type: ${roots.join(', ')}',
      );
    }

    return roots.first;
  }

  /// Strips array suffixes: `Person[2][]` names the struct `Person`.
  static String _baseType(String type) {
    final bracket = type.indexOf('[');

    return bracket < 0 ? type : type.substring(0, bracket);
  }

  /// Every struct [name] depends on, transitively, excluding itself.
  Set<String> _dependencies(String name, [Set<String>? found]) {
    final seen = found ?? <String>{};

    for (final field in types[name] ?? const <TypedDataField>[]) {
      final base = _baseType(field.type);

      if (types.containsKey(base) && seen.add(base)) {
        _dependencies(base, seen);
      }
    }

    return seen;
  }

  /// The canonical type string, e.g. `Mail(Person from,Person to,string contents)Person(...)`.
  String encodeType(String name) {
    if (!types.containsKey(name)) {
      throw FormatException('unknown type: $name');
    }

    // Primary first, then its dependencies alphabetically. The spec fixes this order because the
    // resulting string is hashed — a different order is a different type hash and a different
    // signature.
    final deps = _dependencies(name).where((d) => d != name).toList()..sort();

    final buffer = StringBuffer();

    for (final type in <String>[name, ...deps]) {
      final fields = types[type]!.map((f) => '${f.type} ${f.name}').join(',');

      buffer.write('$type($fields)');
    }

    return buffer.toString();
  }

  Uint8List typeHash(String name) => keccakUtf8(encodeType(name));

  /// `keccak256(typeHash ‖ encodeData(...))` for one struct value.
  Uint8List hashStruct(String name, Map<String, dynamic> data) {
    final out = BytesBuilder()..add(typeHash(name));

    for (final field in types[name]!) {
      out.add(_encodeField(field.type, data[field.name]));
    }

    return keccak256(out.toBytes());
  }

  /// One field, always exactly 32 bytes.
  Uint8List _encodeField(String type, dynamic value) {
    final array = _arrayOf(type);

    if (array != null) {
      if (value is! List) {
        throw FormatException('expected a list for $type');
      }

      if (array.length != null && array.length != value.length) {
        throw FormatException(
          'expected ${array.length} items for $type, got ${value.length}',
        );
      }

      final out = BytesBuilder();

      for (final item in value) {
        out.add(_encodeField(array.type, item));
      }

      return keccak256(out.toBytes());
    }

    if (types.containsKey(type)) {
      if (value is! Map<String, dynamic>) {
        throw FormatException('expected an object for struct $type');
      }

      return hashStruct(type, value);
    }

    if (type == 'string') {
      return keccak256(Uint8List.fromList(utf8.encode(_asString(value))));
    }

    if (type == 'bytes') {
      return keccak256(_asBytes(value));
    }

    if (type == 'address') {
      return _padLeft(_addressBytes(value));
    }

    if (type == 'bool') {
      return _padLeft(Uint8List.fromList(<int>[_asBool(value) ? 1 : 0]));
    }

    // bytes1 .. bytes32 are right-padded, unlike every other type here.
    final fixedBytes = RegExp(r'^bytes(\d+)$').firstMatch(type);

    if (fixedBytes != null) {
      final width = int.parse(fixedBytes.group(1)!);

      if (width < 1 || width > 32) {
        throw FormatException('invalid type: $type');
      }

      final bytes = _asBytes(value);

      if (bytes.length != width) {
        throw FormatException(
          'expected $width bytes for $type, got ${bytes.length}',
        );
      }

      final padded = Uint8List(32);
      padded.setRange(0, bytes.length, bytes);

      return padded;
    }

    final number = RegExp(r'^(u?)int(\d*)$').firstMatch(type);

    if (number != null) {
      return _encodeNumber(_asBigInt(value), signed: number.group(1)!.isEmpty);
    }

    throw FormatException('unsupported type: $type');
  }

  /// Two's-complement big-endian, 32 bytes.
  Uint8List _encodeNumber(BigInt value, {required bool signed}) {
    if (!signed && value.isNegative) {
      throw FormatException('negative value for an unsigned type');
    }

    final normalised = value.isNegative ? (BigInt.one << 256) + value : value;

    if (normalised < BigInt.zero || normalised >= (BigInt.one << 256)) {
      throw const FormatException('numeric value does not fit in 32 bytes');
    }

    final out = Uint8List(32);

    var remaining = normalised;

    for (var i = 31; i >= 0 && remaining > BigInt.zero; i--) {
      out[i] = (remaining & BigInt.from(0xff)).toInt();
      remaining = remaining >> 8;
    }

    return out;
  }

  static Uint8List _padLeft(Uint8List bytes) {
    final out = Uint8List(32);
    out.setRange(32 - bytes.length, 32, bytes);

    return out;
  }

  static _ArrayType? _arrayOf(String type) {
    final match = RegExp(r'^(.*)\[(\d*)\]$').firstMatch(type);

    if (match == null) {
      return null;
    }

    final size = match.group(2)!;

    return _ArrayType(match.group(1)!, size.isEmpty ? null : int.parse(size));
  }

  static String _asString(dynamic value) => value is String
      ? value
      : throw FormatException('expected a string, got $value');

  static bool _asBool(dynamic value) {
    if (value is bool) return value;
    if (value is num) return value != 0;

    throw FormatException('expected a bool, got $value');
  }

  static Uint8List _asBytes(dynamic value) {
    if (value is Uint8List) return value;
    if (value is List<int>) return Uint8List.fromList(value);
    if (value is String) return hexToBytes(value);

    throw FormatException('expected bytes, got $value');
  }

  static Uint8List _addressBytes(dynamic value) {
    final bytes = _asBytes(value);

    if (bytes.length != 20) {
      throw FormatException(
        'expected a 20-byte address, got ${bytes.length} bytes',
      );
    }

    return bytes;
  }

  static BigInt _asBigInt(dynamic value) {
    if (value is BigInt) return value;
    if (value is int) return BigInt.from(value);

    if (value is String) {
      final trimmed = value.trim();

      return trimmed.startsWith('0x') || trimmed.startsWith('0X')
          ? BigInt.parse(trimmed.substring(2), radix: 16)
          : BigInt.parse(trimmed);
    }

    throw FormatException('expected a number, got $value');
  }

  /// The domain separator.
  ///
  /// The `EIP712Domain` type is built from the fields the domain actually carries, in the canonical
  /// order the spec lists them. Declaring a field the domain does not hold, or omitting one it does,
  /// changes the separator and therefore every signature made under it.
  static Uint8List hashDomain(Map<String, dynamic> domain) {
    const canonical = <String, String>{
      'name': 'string',
      'version': 'string',
      'chainId': 'uint256',
      'verifyingContract': 'address',
      'salt': 'bytes32',
    };

    final fields = <TypedDataField>[];

    for (final entry in canonical.entries) {
      final value = domain[entry.key];

      if (value != null) {
        fields.add(TypedDataField(entry.key, entry.value));
      }
    }

    final unknown = domain.keys.where((k) => !canonical.containsKey(k));

    if (unknown.isNotEmpty) {
      throw FormatException('unknown domain field(s): ${unknown.join(', ')}');
    }

    return TypedDataEncoder(<String, List<TypedDataField>>{
      'EIP712Domain': fields,
    }, primaryType: 'EIP712Domain').hashStruct('EIP712Domain', domain);
  }

  /// The 32-byte digest a signature is actually made over.
  static Uint8List digest(
    Map<String, dynamic> domain,
    Map<String, List<TypedDataField>> types,
    Map<String, dynamic> message, {
    String? primaryType,
  }) {
    final encoder = TypedDataEncoder(types, primaryType: primaryType);

    final out = BytesBuilder()
      ..add(<int>[0x19, 0x01])
      ..add(hashDomain(domain))
      ..add(encoder.hashStruct(encoder.primaryType, message));

    return keccak256(out.toBytes());
  }
}

class _ArrayType {
  const _ArrayType(this.type, this.length);

  final String type;
  final int? length;
}
