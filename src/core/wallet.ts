import { ethers } from 'ethers';

export interface SendParams {
    to: string;
    amount: string;

    /** The native token's own decimals. This used to be hardcoded to 18 through `parseEther`, so
        on a chain that uses anything else the amount confirmed was not the amount broadcast. */
    decimals: number;
    token?: { address: string; decimals: number };
}

const transferAbi = ['function transfer(address to, uint256 amount) returns (bool)'];

/* One description of the transaction, built once and used by both the estimate and the send, so
   the fee shown on the review screen prices the transaction that actually goes out. */
const describe = (signer: ethers.Wallet | ethers.HDNodeWallet, params: SendParams): ethers.TransactionRequest => {
    if (params.token === undefined) {
        return { to: params.to, value: ethers.parseUnits(params.amount, params.decimals) };
    }

    const contract = new ethers.Contract(params.token.address, transferAbi, signer);

    return {
        to: params.token.address,
        data: contract.interface.encodeFunctionData('transfer', [params.to, ethers.parseUnits(params.amount, params.token.decimals)])
    };
};

/**
 * What this transaction costs to mine, in native base units.
 *
 * Nothing in the send flow used to price gas at all, so the review screen omitted the one number
 * that decides whether the transfer can land — and `Max` on the native token proposed the entire
 * balance, which cannot pay for its own execution.
 */
export const estimateFee = async (provider: ethers.Provider, from: string, signer: ethers.Wallet | ethers.HDNodeWallet, params: SendParams) => {
    const request = describe(signer, params);

    const [gas, fees] = await Promise.all([provider.estimateGas({ ...request, from }), provider.getFeeData()]);

    const price = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;

    return gas * price;
};

const broadcast = async (signer: ethers.Wallet | ethers.HDNodeWallet, params: SendParams) => {
    const transaction = await signer.sendTransaction(describe(signer, params));

    return transaction.hash;
};

export class PrivateKeyWalletManager {
    private readonly WalletSigner: ethers.Wallet;

    public constructor(privateKey: string) {
        this.WalletSigner = new ethers.Wallet(privateKey);
    }

    public retrieve() {
        return { Public: this.WalletSigner.address, Private: this.WalletSigner.privateKey };
    }

    public async sign(message: string | Uint8Array) {
        return this.WalletSigner.signMessage(message);
    }

    public verify(message: string, signature: string) {
        return ethers.verifyMessage(message, signature) === this.WalletSigner.address;
    }

    public async send(provider: ethers.Provider, params: SendParams) {
        return broadcast(this.WalletSigner.connect(provider), params);
    }

    public async estimate(provider: ethers.Provider, params: SendParams) {
        return estimateFee(provider, this.WalletSigner.address, this.WalletSigner.connect(provider), params);
    }

    public toString() {
        return this.WalletSigner.address;
    }
}

class WalletManager {
    private readonly WalletAddress: string;
    private readonly WalletDerive: ethers.HDNodeWallet;

    public constructor(mnemonic: string, index: number) {
        const normalized = mnemonic.normalize('NFKD');

        const wallet = ethers.HDNodeWallet.fromPhrase(normalized, '', `m/44'/60'/0'`);

        this.WalletDerive = wallet.derivePath(`0/${index}`);
        this.WalletAddress = this.WalletDerive.address;
    }

    public retrieve() {
        return { Public: this.WalletDerive.address, Private: this.WalletDerive.privateKey };
    }

    public async sign(message: string | Uint8Array) {
        return this.WalletDerive.signMessage(message);
    }

    public verify(message: string, signature: string) {
        return ethers.verifyMessage(message, signature) === this.WalletAddress;
    }

    public async send(provider: ethers.Provider, params: SendParams) {
        return broadcast(this.WalletDerive.connect(provider), params);
    }

    public async estimate(provider: ethers.Provider, params: SendParams) {
        return estimateFee(provider, this.WalletAddress, this.WalletDerive.connect(provider), params);
    }

    public toString() {
        return this.WalletAddress;
    }

    public static Generate() {
        const wallet = ethers.Wallet.createRandom();

        return wallet.mnemonic?.phrase;
    }

    public static Validate(mnemonic: string) {
        return ethers.Mnemonic.isValidMnemonic(mnemonic);
    }

    public static Verify(message: string, signature: string) {
        return ethers.verifyMessage(message, signature);
    }

    public static FromPrivateKey(privateKey: string) {
        const hex = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

        return new PrivateKeyWalletManager(hex);
    }

    public static ValidatePrivateKey(privateKey: string) {
        try {
            WalletManager.FromPrivateKey(privateKey);

            return true;
        } catch {
            return false;
        }
    }
}

export default WalletManager;
