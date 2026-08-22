import 'dart:convert';

/// One EVM network the wallet can talk to.
///
/// [custom] marks user-added networks, which are the only removable ones. [explorerApi] is the
/// Etherscan-compatible endpoint used for history; absent, the explorer's own `/api` path is assumed,
/// which is what a Blockscout instance exposes.
class Network {
  const Network({
    required this.id,
    required this.name,
    required this.chainId,
    required this.symbol,
    required this.rpcUrl,
    this.coin,
    this.rpcBackups = const <String>[],
    this.explorerUrl = '',
    this.explorerApi,
    this.explorerKey,
    this.decimals = 18,
    this.custom = false,
  });

  final String id;
  final String name;
  final int chainId;
  final String symbol;

  /// The coin's display name, when it differs from the chain's.
  ///
  /// "Nura Chain" is the network; "Nura Coin" is the thing you hold on it. Unset, the chain name
  /// stands in — which is what the other built-ins want.
  final String? coin;

  final String rpcUrl;

  /// Further endpoints for the same chain, tried in order when the one before does not answer.
  ///
  /// A public endpoint is not a dependency anyone controls: it can rate-limit, start demanding a key
  /// or stop resolving, and a wallet with one endpoint shows no balance at all when that happens.
  final List<String> rpcBackups;

  final String explorerUrl;
  final String? explorerApi;

  /// Sent as `apikey` with every explorer call, for the explorers that demand one.
  final String? explorerKey;

  final int decimals;
  final bool custom;

  /// Every endpoint in priority order, blanks removed.
  List<String> get endpoints => <String>[
    rpcUrl,
    ...rpcBackups,
  ].map((e) => e.trim()).where((e) => e.isNotEmpty).toList(growable: false);

  /// What to call the native coin.
  String get coinName => coin ?? name;

  /// The chain id as EIP-695 requires it: minimal hex, no leading zeros.
  String get chainIdHex => '0x${chainId.toRadixString(16)}';

  /// Where a transaction can be read on this chain's explorer, or null when it declares none.
  ///
  /// Null rather than an empty string so a caller cannot accidentally open `/tx/0x…` against no
  /// host: the absence has to be handled, and the row that would open it is disabled instead.
  Uri? transactionUrl(String hash) {
    if (explorerUrl.isEmpty || hash.isEmpty) {
      return null;
    }

    return Uri.tryParse(
      '${explorerUrl.replaceAll(RegExp(r'/+$'), '')}/tx/$hash',
    );
  }

  /// The Etherscan-compatible API base, with any key folded in.
  ///
  /// Folded here rather than at each call site: every caller appends its own query with the same
  /// `?`-or-`&` test, so a key carried here rides along with all of them.
  String get explorerApiBase {
    final guessed = explorerUrl.isEmpty
        ? ''
        : '${explorerUrl.replaceAll(RegExp(r'/+$'), '')}/api';

    final base = (explorerApi != null && explorerApi!.isNotEmpty)
        ? explorerApi!
        : guessed;

    if (base.isEmpty || explorerKey == null || explorerKey!.isEmpty) {
      return base;
    }

    return '$base${base.contains('?') ? '&' : '?'}apikey=${Uri.encodeComponent(explorerKey!)}';
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'name': name,
    'chainId': chainId,
    'symbol': symbol,
    if (coin != null) 'coin': coin,
    'rpcUrl': rpcUrl,
    'rpcBackups': rpcBackups,
    'explorerUrl': explorerUrl,
    if (explorerApi != null) 'explorerApi': explorerApi,
    if (explorerKey != null) 'explorerKey': explorerKey,
    'decimals': decimals,
    'custom': custom,
  };

  /// Reads a stored network, or null when the entry is unusable.
  ///
  /// Returns null rather than throwing so one corrupt row costs that network and not the list — a
  /// wallet that cannot read its custom chains should still open on its built-in ones.
  static Network? fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final chainId = json['chainId'];
    final rpcUrl = json['rpcUrl'];

    if (id is! String || chainId is! int || rpcUrl is! String) {
      return null;
    }

    List<String> strings(Object? value) => value is List
        ? value.whereType<String>().where((s) => s.isNotEmpty).toList()
        : const <String>[];

    return Network(
      id: id,
      name: json['name'] is String ? json['name'] as String : 'Chain $chainId',
      chainId: chainId,
      symbol: json['symbol'] is String ? json['symbol'] as String : 'ETH',
      coin: json['coin'] is String ? json['coin'] as String : null,
      rpcUrl: rpcUrl,
      // A network stored before backups existed has none, and a corrupted list should cost the
      // extra endpoints rather than the whole network.
      rpcBackups: strings(json['rpcBackups']),
      explorerUrl: json['explorerUrl'] is String
          ? json['explorerUrl'] as String
          : '',
      explorerApi: json['explorerApi'] is String
          ? json['explorerApi'] as String
          : null,
      explorerKey: json['explorerKey'] is String
          ? json['explorerKey'] as String
          : null,
      decimals: json['decimals'] is int ? json['decimals'] as int : 18,
      custom: json['custom'] == true,
    );
  }

  static List<Network> decodeList(String raw) {
    final decoded = jsonDecode(raw);

    if (decoded is! List) {
      return const <Network>[];
    }

    return decoded
        .whereType<Map<String, dynamic>>()
        .map(Network.fromJson)
        .whereType<Network>()
        .toList();
  }
}

/// Nura Chain's id, named because two modules have to agree on it.
///
/// Not a fixed fact: the chain relaunched as 1020 having been 1010, and the price lookups are keyed
/// by chain id — so an id corrected in one place and not the other does not fail loudly, it quietly
/// goes back to drawing every Nura logo as a letter.
const int nuraChainId = 1020;

/// The networks shipped with the app. These can never be removed.
///
/// Nura Chain leads, which also makes it the network a fresh install starts on. Every value here is
/// copied from `defaultNetworks` in the Tauri build, including the endpoint ordering, which was
/// chosen by measuring what actually answered.
const List<Network> defaultNetworks = <Network>[
  Network(
    id: 'nura',
    name: 'Nura Chain',
    chainId: nuraChainId,
    symbol: 'Nura',
    coin: 'Nura Coin',
    rpcUrl: 'https://rpc.nurachain.net',
    explorerUrl: 'https://explorer.nurachain.net',
    explorerApi: 'https://explorer.nurachain.net/api',
  ),
  Network(
    id: 'ethereum',
    name: 'Ethereum',
    chainId: 1,
    symbol: 'ETH',
    rpcUrl: 'https://ethereum.publicnode.com',
    rpcBackups: <String>[
      'https://eth.drpc.org',
      'https://cloudflare-eth.com',
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
    ],
    explorerUrl: 'https://etherscan.io',
    explorerApi: 'https://eth.blockscout.com/api',
  ),
  Network(
    id: 'bnb',
    name: 'BNB Smart Chain',
    chainId: 56,
    symbol: 'BNB',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    rpcBackups: <String>[
      'https://bsc-rpc.publicnode.com',
      'https://bsc.publicnode.com',
    ],
    explorerUrl: 'https://bscscan.com',
    // BscScan's V1 host is retired and the `/api` path guessed from the explorer URL answers
    // "Invalid API URL endpoint". This is the address Etherscan's own chain list gives for 56.
    explorerApi: 'https://api.etherscan.io/v2/api?chainid=56',
  ),
];
