import type { BrowserFavorite } from './type/browser';
import type { Network } from './type/network';
import type { SwapAsset } from './type/swap';

/** The app's fixed addresses in one place. They are built in, not read at run time, so a change needs a rebuild. */

const favorites: BrowserFavorite[] = [
    { id: 'baziche', name: 'BaziChe', url: 'https://baziche.com' },
    { id: 'swap', name: 'Swap', url: 'https://swap.nurachain.net' },
    { id: 'ashbringer', name: 'Ashbringer', url: 'https://ashbringer.org' },
    { id: 'goman', name: 'Goman', url: 'https://goman.online' },
    { id: 'nurachain', name: 'Nura Chain', url: 'https://nurachain.net' },
    { id: 'discord', name: 'Discord', url: 'https://discord.gg/vxyzMY8yFy' },
    { id: 'telegram', name: 'Nura Telegram', url: 'https://t.me/nurachain' }
];

/** Nura Chain stays first: its chain id is read from here. */
const networks: Network[] = [
    {
        id: 'nura',
        name: 'Nura Chain',
        chainId: 1020,
        symbol: 'Nura',
        coin: 'Nura Coin',
        rpcUrl: 'https://rpc.nurachain.net',
        explorerUrl: 'https://explorer.nurachain.net',
        explorerApi: 'https://explorer.nurachain.net/api',
        decimals: 18,
        custom: false
    },
    {
        id: 'ethereum',
        name: 'Ethereum',
        chainId: 1,
        symbol: 'ETH',
        rpcUrl: 'https://ethereum.publicnode.com',
        rpcBackups: ['https://eth.drpc.org', 'https://cloudflare-eth.com', 'https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
        explorerUrl: 'https://etherscan.io',
        explorerApi: 'https://eth.blockscout.com/api',
        decimals: 18,
        custom: false
    },
    {
        id: 'bnb',
        name: 'BNB Smart Chain',
        chainId: 56,
        symbol: 'BNB',
        rpcUrl: 'https://bsc-dataseed.binance.org',
        rpcBackups: ['https://bsc-rpc.publicnode.com', 'https://bsc.publicnode.com'],
        explorerUrl: 'https://bscscan.com',
        explorerApi: 'https://api.etherscan.io/v2/api?chainid=56',
        decimals: 18,
        custom: false
    }
];

/* swap.nurachain.net's Uniswap V3 deployment, from its /api/market/deployment. Pinned rather than fetched: the router is what a token's
   spending is approved to, so an endpoint that changed it would be handing out the user's tokens. */
const swapTokens: SwapAsset[] = [
    { address: '0x14Bd67b20d4CA05677B311830F85A2DFAE579eD2', symbol: 'WNURA', name: 'Wrapped NURA', decimals: 18 },
    { address: '0xeAF3361a86C22e9691283A30338b57cA95567207', symbol: 'USDT', name: 'Bridge USDT', decimals: 18 },
    { address: '0x5891B71b6e18fB8A7d770f65A9060F76C7d2a166', symbol: 'BTC', name: 'Bridge BTC', decimals: 18 },
    { address: '0x4BEf1c404e6BdE102d9FCeca678BD7471f3Fd0ba', symbol: 'ETH', name: 'Bridge ETH', decimals: 18 },
    { address: '0x578fACf1f6d7de0E78D59f405C2A53f387d94E93', symbol: 'BNB', name: 'Bridge BNB', decimals: 18 }
];

export default {
    redeemShop: 'https://ashbringer.org',
    searchUrl: 'https://duckduckgo.com/?q=',
    favorites,
    networks,
    swap: {
        chainId: networks[0].chainId,
        factory: '0x38f606fd69dEF1F3F6C3E70290f48BF885a7776a',
        router: '0x60126ad5df6eFcb8f744063b10f5B881886629d0',
        quoter: '0x692420a1bba97c2953bE5255436c59a555C6c2CE',
        wnura: '0x14Bd67b20d4CA05677B311830F85A2DFAE579eD2',
        fees: [100, 500, 3000, 10_000],
        tokens: swapTokens
    },
    price: {
        coingecko: 'https://api.coingecko.com/api/v3/simple/price',
        market: 'https://swap.nurachain.net/api/market/tokens'
    },
    assets: {
        nura: 'https://raw.githubusercontent.com/NuraChain/Asset/refs/heads/main',
        trustWallet: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains'
    }
};
