import type { Network } from '../core/network';
import type { TokenBalance } from '../core/token';

import { useState } from 'react';
import { IoChevronDown } from 'react-icons/io5';
import { HiOutlineCog6Tooth, HiOutlineSquare2Stack } from 'react-icons/hi2';
import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';

import DashboardActivity from './dashboard.activity';

import { T } from '../utility/language';
import { shortAddress, trimAmount } from '../utility/format';

/**
 * DashboardWallet - Primary account view: balance, address, transfer actions, holdings, and history.
 *
 * Balances are fetched by the parent and passed in, so this tab and the send flow always read the same numbers. Transaction history is mounted here, right under the token list, so the account's holdings and its movements live on one screen.
 * @param {object} props Component props.
 * @param {string} props.address The account address.
 * @param {string} props.name The account label.
 * @param {Network} props.network The active network.
 * @param {string} props.nativeFormatted Native balance as a decimal string.
 * @param {boolean} props.nativeLoading Whether the native balance is still loading.
 * @param {TokenBalance[]} props.tokens Curated token balances.
 * @param {boolean} props.tokensLoading Whether token balances are still loading.
 * @param {() => void} props.onSend Opens the send modal.
 * @param {() => void} props.onReceive Opens the receive modal.
 * @param {() => void} props.onNetwork Opens the network modal.
 * @param {() => void} props.onSettings Opens the settings modal.
 * @returns {JSX.Element} The wallet tab.
 */
export default function DashboardWallet({ address, name, network, nativeFormatted, nativeLoading, tokens, tokensLoading, onSend, onReceive, onNetwork, onSettings }: { address: string; name: string; network: Network; nativeFormatted: string; nativeLoading: boolean; tokens: TokenBalance[]; tokensLoading: boolean; onSend: () => void; onReceive: () => void; onNetwork: () => void; onSettings: () => void })
{
    const [ notice, setNotice ] = useState('');

    const onCopy = async() =>
    {
        try
        {
            await navigator.clipboard.writeText(address);

            setNotice(T('Dashboard.Copied'));
        }
        catch
        {
            setNotice(T('Dashboard.CopyFailed'));
        }
    };

    return (
        <div className='flex flex-col gap-4'>

            <div className='flex items-center justify-between'>

                <div className='text-medium font-semibold text-txt-normal'>

                    { name }

                </div>

                <div className='flex items-center gap-2'>

                    <button
                        type='button'
                        onClick={ onNetwork }
                        className='btn-muted flex h-9 items-center gap-2 rounded-full px-3 text-tiny'>

                        <div className='flex size-5 items-center justify-center rounded-full bg-btn-primary text-txt-reverse'>

                            { network.symbol.slice(0, 1) }

                        </div>

                        { network.name }

                        <IoChevronDown size={ 14 } />

                    </button>

                    <button
                        type='button'
                        onClick={ onSettings }
                        aria-label={ T('Dashboard.Settings.Title') }
                        className='btn-muted flex size-9 shrink-0 items-center justify-center rounded-full text-txt-normal'>

                        <HiOutlineCog6Tooth size={ 18 } />

                    </button>

                </div>

            </div>

            <div className='flex flex-col items-center gap-2 py-2'>

                <div dir='ltr' className='text-3xl font-bold text-txt-normal'>

                    { nativeLoading ? '…' : `${ trimAmount(nativeFormatted) } ${ network.symbol }` }

                </div>

                <button
                    type='button'
                    onClick={ () => { void onCopy(); } }
                    className='flex items-center gap-1 text-tiny text-txt-muted'>

                    <span dir='ltr' className='font-mono'>

                        { shortAddress(address) }

                    </span>

                    <HiOutlineSquare2Stack size={ 14 } />

                </button>

                {
                    notice.length > 0 &&
                    (
                        <div className='text-tiny text-txt-muted'>

                            { notice }

                        </div>
                    )
                }

            </div>

            <div className='flex justify-center gap-3'>

                <button
                    type='button'
                    onClick={ onSend }
                    className='flex flex-col items-center gap-1'>

                    <div className='btn-primary flex size-14 items-center justify-center rounded-full'>

                        <FiArrowUpRight size={ 22 } />

                    </div>

                    <span className='text-tiny text-txt-muted'>

                        { T('Dashboard.Send.Title') }

                    </span>

                </button>

                <button
                    type='button'
                    onClick={ onReceive }
                    className='flex flex-col items-center gap-1'>

                    <div className='btn-normal flex size-14 items-center justify-center rounded-full'>

                        <FiArrowDownLeft size={ 22 } />

                    </div>

                    <span className='text-tiny text-txt-muted'>

                        { T('Dashboard.Receive.Title') }

                    </span>

                </button>

            </div>

            <div className='flex flex-col gap-2'>

                <div className='text-tiny text-txt-muted'>

                    { T('Dashboard.Tokens.Title') }

                </div>

                <div className='glass-panel flex items-center gap-3 rounded-xl p-3'>

                    <div className='flex size-9 items-center justify-center rounded-full bg-btn-primary text-small text-txt-reverse'>

                        { network.symbol.slice(0, 1) }

                    </div>

                    <div className='flex-1'>

                        <div className='text-small text-txt-normal'>

                            { network.symbol }

                        </div>

                        <div className='text-tiny text-txt-muted'>

                            { network.name }

                        </div>

                    </div>

                    <div dir='ltr' className='font-mono text-small text-txt-normal'>

                        { nativeLoading ? '…' : trimAmount(nativeFormatted) }

                    </div>

                </div>

                {
                    tokens.map((item) => (
                        <div
                            key={ item.token.address }
                            className='glass-panel flex items-center gap-3 rounded-xl p-3'>

                            <div className='flex size-9 items-center justify-center rounded-full bg-btn-secondary text-small text-txt-reverse'>

                                { item.token.symbol.slice(0, 1) }

                            </div>

                            <div className='flex-1'>

                                <div className='text-small text-txt-normal'>

                                    { item.token.symbol }

                                </div>

                                <div className='text-tiny text-txt-muted'>

                                    { item.token.name }

                                </div>

                            </div>

                            <div dir='ltr' className='font-mono text-small text-txt-normal'>

                                { trimAmount(item.formatted) }

                            </div>

                        </div>
                    ))
                }

                {
                    !tokensLoading && tokens.length === 0 &&
                    (
                        <div className='py-2 text-center text-tiny text-txt-muted'>

                            { T('Dashboard.Tokens.Empty') }

                        </div>
                    )
                }

            </div>

            <DashboardActivity
                address={ address }
                network={ network } />

        </div>
    );
}
