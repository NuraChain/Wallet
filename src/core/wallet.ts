import { ethers } from 'ethers';

export interface SendParams {
    to: string;
    amount: string;
    token?: { address: string; decimals: number };
}

const transferAbi = ['function transfer(address to, uint256 amount) returns (bool)'];

const broadcast = async (signer: ethers.Wallet | ethers.HDNodeWallet, params: SendParams) => {
    if (params.token === undefined) {
        const transaction = await signer.sendTransaction({ to: params.to, value: ethers.parseEther(params.amount) });

        return transaction.hash;
    }

    const contract = new ethers.Contract(params.token.address, transferAbi, signer);

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const transaction = (await contract.transfer(params.to, ethers.parseUnits(params.amount, params.token.decimals))) as ethers.TransactionResponse;

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
