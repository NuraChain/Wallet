import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nura_wallet/domain/signing/eip712.dart';
import 'package:nura_wallet/domain/signing/message_signer.dart';
import 'package:web3dart/crypto.dart';

Map<String, dynamic> _vectors() =>
    jsonDecode(File('test/vectors/reference_vectors.json').readAsStringSync())
        as Map<String, dynamic>;

String _hex(List<int> bytes) => '0x${bytesToHex(bytes)}';

Map<String, List<TypedDataField>> _types(Map<String, dynamic> json) =>
    TypedDataEncoder.fromJson(json).types;

void main() {
  final vectors = _vectors();

  group('EIP-191 personal_sign', () {
    final personal = vectors['personalSign'] as Map<String, dynamic>;
    final signer = MessageSigner.fromHex(
      (vectors['privateKeyImport'] as Map<String, dynamic>)['privateKey']
          as String,
    );

    test('signs as the account the vectors were made with', () {
      expect(signer.address, personal['signer']);
    });

    for (final entry
        in (personal['cases'] as List<dynamic>).cast<Map<String, dynamic>>()) {
      test('matches the ${entry['kind']} case', () {
        expect(
          signer.signPersonalMessage(entry['input'] as String),
          entry['signature'],
        );
      });
    }

    // The distinction that decides whether a signature verifies at all: hex input is bytes, and
    // signing its characters instead would be valid, unverifiable, and invisible to the user.
    test('hex input signs the same as its decoded text', () {
      expect(
        signer.signPersonalMessage('0x48656c6c6f204e757261'),
        signer.signPersonalMessage('Hello Nura'),
      );
      expect(personal['hexEqualsUtf8'], isTrue);
    });

    test('odd-length hex is text, not bytes', () {
      // "0xabc" cannot be bytes. Padding it would invent a nibble and change the message.
      expect(
        signer.signPersonalMessage('0xabc'),
        isNot(signer.signPersonalMessage('0x0abc')),
      );
    });
  });

  group('EIP-712 typed data', () {
    final typed = vectors['signTypedData'] as Map<String, dynamic>;
    final domain = typed['domain'] as Map<String, dynamic>;
    final types = _types(typed['types'] as Map<String, dynamic>);
    final message = typed['message'] as Map<String, dynamic>;

    final signer = MessageSigner.fromHex(
      (vectors['privateKeyImport'] as Map<String, dynamic>)['privateKey']
          as String,
    );

    test('domain separator matches ethers', () {
      expect(
        _hex(TypedDataEncoder.hashDomain(domain)),
        typed['domainSeparator'],
      );
    });

    test('struct hash matches ethers', () {
      final encoder = TypedDataEncoder(types);

      expect(encoder.primaryType, 'Mail');
      expect(_hex(encoder.hashStruct('Mail', message)), typed['structHash']);
    });

    test('digest matches ethers', () {
      expect(
        _hex(TypedDataEncoder.digest(domain, types, message)),
        typed['digest'],
      );
    });

    test('signature matches ethers', () {
      expect(signer.signTypedData(domain, types, message), typed['signature']);
    });

    test('canonical type string is built in the order the spec fixes', () {
      // Primary first, dependencies alphabetically. The string is hashed, so order is normative.
      expect(
        TypedDataEncoder(types).encodeType('Mail'),
        'Mail(Person from,Person to,string contents)Person(string name,address wallet)',
      );
    });

    test('infers the primary type when the payload omits it', () {
      expect(TypedDataEncoder(types).primaryType, 'Mail');
    });

    test('refuses an ambiguous or cyclic type graph', () {
      // Two roots: nothing references either, so there is no single primary type to infer.
      expect(
        () => TypedDataEncoder(<String, List<TypedDataField>>{
          'A': const [TypedDataField('x', 'string')],
          'B': const [TypedDataField('y', 'string')],
        }),
        throwsFormatException,
      );

      // A cycle: every type is referenced, so there is no root at all.
      expect(
        () => TypedDataEncoder(<String, List<TypedDataField>>{
          'A': const [TypedDataField('b', 'B')],
          'B': const [TypedDataField('a', 'A')],
        }),
        throwsFormatException,
      );
    });

    test('parses the wire form a dApp sends', () {
      final request = MessageSigner.parseRequest(
        jsonEncode(<String, dynamic>{
          'domain': domain,
          'types': typed['types'],
          'message': message,
          'primaryType': 'Mail',
        }),
      );

      expect(request.primaryType, 'Mail');
      expect(request.chainId, 1020);
      expect(
        signer.signTypedData(
          request.domain,
          request.types,
          request.message,
          primaryType: request.primaryType,
        ),
        typed['signature'],
      );
    });

    test('drops a declared EIP712Domain rather than double-counting it', () {
      final withDomain =
          Map<String, dynamic>.from(typed['types'] as Map<String, dynamic>)
            ..['EIP712Domain'] = <dynamic>[
              <String, String>{'name': 'name', 'type': 'string'},
            ];

      final encoder = TypedDataEncoder.fromJson(withDomain);

      expect(encoder.types.containsKey('EIP712Domain'), isFalse);
      expect(encoder.primaryType, 'Mail');
    });

    test('rejects a domain field the spec does not define', () {
      expect(
        () => TypedDataEncoder.hashDomain(<String, dynamic>{
          'name': 'Nura',
          'chainSalt': 'nope',
        }),
        throwsFormatException,
      );
    });

    test('a changed domain changes the digest', () {
      final other = Map<String, dynamic>.from(domain)..['chainId'] = 1;

      expect(
        _hex(TypedDataEncoder.digest(other, types, message)),
        isNot(typed['digest']),
      );
    });
  });

  group('EIP-712 field encoding', () {
    // Each of these is a type the vectors above do not exercise, and each has its own way of going
    // wrong: fixed bytes pad right where everything else pads left, signed integers are two's
    // complement, and arrays hash their concatenation rather than being inlined.
    final encoder = TypedDataEncoder(<String, List<TypedDataField>>{
      'Kitchen': const [
        TypedDataField('flag', 'bool'),
        TypedDataField('small', 'uint8'),
        TypedDataField('negative', 'int256'),
        TypedDataField('tag', 'bytes4'),
        TypedDataField('blob', 'bytes'),
        TypedDataField('names', 'string[]'),
        TypedDataField('pair', 'uint256[2]'),
      ],
    });

    final value = <String, dynamic>{
      'flag': true,
      'small': 255,
      'negative': BigInt.from(-1),
      'tag': '0xdeadbeef',
      'blob': '0x0102',
      'names': <String>['a', 'b'],
      'pair': <int>[1, 2],
    };

    test('encodes every atomic and dynamic kind without throwing', () {
      expect(encoder.hashStruct('Kitchen', value).length, 32);
    });

    test('an unsigned type refuses a negative value', () {
      final bad = TypedDataEncoder(<String, List<TypedDataField>>{
        'N': const [TypedDataField('v', 'uint256')],
      });

      expect(
        () => bad.hashStruct('N', <String, dynamic>{'v': BigInt.from(-1)}),
        throwsFormatException,
      );
    });

    test('a fixed-size array checks its length', () {
      expect(
        () => encoder.hashStruct('Kitchen', <String, dynamic>{
          ...value,
          'pair': <int>[1, 2, 3],
        }),
        throwsFormatException,
      );
    });

    test('bytesN checks its width', () {
      expect(
        () => encoder.hashStruct('Kitchen', <String, dynamic>{
          ...value,
          'tag': '0xdead',
        }),
        throwsFormatException,
      );
    });

    test('an address must be twenty bytes', () {
      final bad = TypedDataEncoder(<String, List<TypedDataField>>{
        'A': const [TypedDataField('who', 'address')],
      });

      expect(
        () => bad.hashStruct('A', <String, dynamic>{'who': '0xdeadbeef'}),
        throwsFormatException,
      );
    });
  });
}
