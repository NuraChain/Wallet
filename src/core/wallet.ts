import { ethers } from 'ethers';

/**
 * Parameters describing a single outgoing transfer.
 *
 * When `token` is omitted the transfer is of the network's native coin; otherwise it is an ERC20 `transfer` on the given contract.
 */
export interface SendParams
{
    to: string;
    amount: string;
    token?: { address: string; decimals: number };
}

/**
 * Minimal ERC20 write surface used for outgoing transfers.
 */
const transferAbi = [ 'function transfer(address to, uint256 amount) returns (bool)' ];

/**
 * Broadcast a signed transfer from an already-connected signer.
 *
 * Handles native transfers and ERC20 transfers behind one call so both wallet types share it.
 * @param {ethers.Wallet | ethers.HDNodeWallet} signer Signer connected to a provider.
 * @param {SendParams} params Recipient, amount, and optional token.
 * @returns {Promise<string>} The broadcast transaction hash.
 */
const broadcast = async(signer: ethers.Wallet | ethers.HDNodeWallet, params: SendParams) =>
{
    if (params.token === undefined)
    {
        const transaction = await signer.sendTransaction({ to: params.to, value: ethers.parseEther(params.amount) });

        return transaction.hash;
    }

    const contract = new ethers.Contract(params.token.address, transferAbi, signer);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const transaction = await contract.transfer(params.to, ethers.parseUnits(params.amount, params.token.decimals)) as ethers.TransactionResponse;

    return transaction.hash;
};

/**
 * PrivateKeyWalletManager - Wrapper for wallets imported via raw private key.
 * Exposes the same public API surface as WalletManager.
 */
export class PrivateKeyWalletManager
{
    private readonly WalletSigner: ethers.Wallet;

    public constructor(privateKey: string)
    {
        this.WalletSigner = new ethers.Wallet(privateKey);
    }

    public retrieve()
    {
        return { Public: this.WalletSigner.address, Private: this.WalletSigner.privateKey };
    }

    public async sign(message: string | Uint8Array)
    {
        return this.WalletSigner.signMessage(message);
    }

    public verify(message: string, signature: string)
    {
        return ethers.verifyMessage(message, signature) === this.WalletSigner.address;
    }

    /**
     * send - Broadcasts a native or ERC20 transfer signed by this wallet.
     * @param {ethers.Provider} provider - The provider to broadcast through
     * @param {SendParams} params - Recipient, amount, and optional token
     * @returns {Promise<string>} The broadcast transaction hash
     */
    public async send(provider: ethers.Provider, params: SendParams)
    {
        return broadcast(this.WalletSigner.connect(provider), params);
    }

    public toString()
    {
        return this.WalletSigner.address;
    }
}

class WalletManager
{
    private readonly WalletAddress: string;
    private readonly WalletDerive: ethers.HDNodeWallet;

    /**
     * Constructor - Initializes a wallet manager from a mnemonic phrase
     * @param {string} mnemonic - The BIP39 mnemonic phrase
     * @param {number} index - The wallet derivation index path
     */
    public constructor(mnemonic: string, index: number)
    {
        const normalized = mnemonic.normalize('NFKD');

        const wallet = ethers.HDNodeWallet.fromPhrase(normalized, '', `m/44'/60'/0'`);

        this.WalletDerive = wallet.derivePath(`0/${ index }`);
        this.WalletAddress = this.WalletDerive.address;
    }

    /**
     * retrieve - Returns the public and private keys of the derived wallet
     * @returns {Object} Object containing Public and Private key strings
     */
    public retrieve()
    {
        return { Public: this.WalletDerive.address, Private: this.WalletDerive.privateKey };
    }

    /**
     * sign - Signs a message using the wallet's private key
     * @param {string | Uint8Array} message - The message to sign
     * @returns {Promise<string>} The signature string
     */
    public async sign(message: string | Uint8Array)
    {
        return this.WalletDerive.signMessage(message);
    }

    /**
     * verify - Verifies that a signature was created by this wallet
     * @param {string} message - The original message
     * @param {string} signature - The signature to verify
     * @returns {boolean} True if signature is valid for this wallet, false otherwise
     */
    public verify(message: string, signature: string)
    {
        return ethers.verifyMessage(message, signature) === this.WalletAddress;
    }

    /**
     * send - Broadcasts a native or ERC20 transfer signed by the derived wallet
     * @param {ethers.Provider} provider - The provider to broadcast through
     * @param {SendParams} params - Recipient, amount, and optional token
     * @returns {Promise<string>} The broadcast transaction hash
     */
    public async send(provider: ethers.Provider, params: SendParams)
    {
        return broadcast(this.WalletDerive.connect(provider), params);
    }

    /**
     * toString - Returns the wallet address as a string
     * @returns {string} The wallet address
     */
    public toString()
    {
        return this.WalletAddress;
    }

    /**
     * Generate - Generates a new random BIP39 mnemonic phrase
     * @returns {string} A new mnemonic phrase
     */
    public static Generate()
    {
        const wallet = ethers.Wallet.createRandom();

        return wallet.mnemonic?.phrase;
    }

    /**
     * Validate - Validates if a mnemonic phrase is valid BIP39
     * @param {string} mnemonic - The mnemonic phrase to validate
     * @returns {boolean} True if the mnemonic is valid, false otherwise
     */
    public static Validate(mnemonic: string)
    {
        return ethers.Mnemonic.isValidMnemonic(mnemonic);
    }

    /**
     * Verify - Recovers the wallet address from a signed message
     * @param {string} message - The original message
     * @param {string} signature - The signature
     * @returns {string} The recovered wallet address
     */
    public static Verify(message: string, signature: string)
    {
        return ethers.verifyMessage(message, signature);
    }

    /**
     * FromPrivateKey - Creates a wallet wrapper from a raw hex private key.
     * @param {string} privateKey - The raw 64-char hex private key (with or without 0x prefix)
     * @returns {PrivateKeyWalletManager} A wallet wrapper that exposes the same public API as WalletManager
     */
    public static FromPrivateKey(privateKey: string)
    {
        const hex = privateKey.startsWith('0x') ? privateKey : `0x${ privateKey }`;

        return new PrivateKeyWalletManager(hex);
    }

    /**
     * ValidatePrivateKey - Checks whether a string is a usable secp256k1 private key.
     *
     * The 64-hex shape is necessary but not sufficient: zero and anything at or above the curve order
     * are the right length and still not keys, and ethers is the thing that knows where that boundary
     * is. So the check is to build the wallet and see whether it objects, rather than to re-implement
     * the range test against a constant copied out of the spec.
     * @param {string} privateKey - The candidate key, with or without the 0x prefix
     * @returns {boolean} True when a signer can be built from it
     */
    public static ValidatePrivateKey(privateKey: string)
    {
        try
        {
            WalletManager.FromPrivateKey(privateKey);

            return true;
        }
        catch
        {
            return false;
        }
    }
}

export default WalletManager;
