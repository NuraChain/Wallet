import type { Token } from '../../core/token';

import { useRef, useState, type ReactNode } from 'react';
import { formatUnits } from 'ethers';
import { ArrowDown, KeyRound, User } from 'lucide-react';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Panel from '../ui/panel';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import ListCard from '../ui/list';
import ScrollBar from '../ui/scrollbar';
import AddressBlock from '../ui/address';
import SiteIcon from '../site.icon';
import TokenIcon from '../token.icon';
import { Horizontal, Vertical } from '../ui/stack';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../ui/modal';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { shortAddress } from '../../utility/format';
import { getNativeLogo } from '../../core/price';
import { readCalldata } from '../../core/calldata';
import { resolveDappPrompt, type DappPrompt } from '../../core/dapp.rpc';

interface Row {
    label: string;
    value: string;
    mono: boolean;
}

const noteMap: Record<DappPrompt['kind'], string> = {
    connect: 'Dashboard.Request.ConnectNote',
    signature: 'Dashboard.Request.SignatureNote',
    typed: 'Dashboard.Request.TypedNote',
    transaction: 'Dashboard.Request.TransactionNote',
    chain: 'Dashboard.Request.ChainNote',
    asset: 'Dashboard.Request.AssetNote'
};

/* A value dropped into a translated sentence keeps its own direction, or "0.25 ETH" is reordered
   around its punctuation inside a Persian or Arabic headline. */
const isolate = (value: string) => `\u2068${value}\u2069`;

/* formatUnits always leaves a decimal point, and a whole amount reads better without its ".0".
   Nothing else is rounded: dust hidden behind six decimals is exactly what a drainer counts on. */
const exact = (value: string) => value.replace(/\.0(?=\s|$)/u, '');

const siteOf = (origin: string) => {
    try {
        const url = new URL(origin);

        // `host` stays in punycode for an internationalised name, which is the whole defence
        // against a lookalike domain, and keeps its `www.` where getSiteHost drops it: this is the
        // one screen where the exact name is what gets checked.
        return { host: url.host, secure: url.protocol === 'https:' };
    } catch {
        return { host: origin, secure: false };
    }
};

/**
 * One end of what the request moves. The first stop carries the rail down to the second, and that
 * rail is the only thing on screen that says which way the value, the access or the network goes.
 */
function Stop({ icon, label, rail = false, children }: { icon: ReactNode; label: string; rail?: boolean; children: ReactNode }) {
    return (
        <Horizontal className='gap-3'>
            <Vertical className='shrink-0 items-center'>
                {icon}

                {rail && <div aria-hidden='true' className='my-1 w-px flex-1 bg-line' />}
            </Vertical>

            <Vertical className={cn('min-w-0 flex-1 gap-0.5', rail && 'pb-4')}>
                <Text text={label} />

                {children}
            </Vertical>
        </Horizontal>
    );
}

export default function DashboardRequest({
    prompt,
    name,
    emoji,
    address,
    network,
    tokens
}: {
    prompt: DappPrompt;
    name: string;
    emoji: string;
    address: string;
    network: string;
    tokens: Token[];
}) {
    // Which way the person answered. In an extension the answer travels to the worker before the
    // queue moves on, so the pressed button carries the spinner and neither can fire twice.
    const [answered, setAnswered] = useState<boolean | undefined>(undefined);

    const payloadRef = useRef<HTMLDivElement>(null);

    const onAnswer = (approved: boolean) => {
        if (answered !== undefined) {
            return;
        }

        setAnswered(approved);

        resolveDappPrompt(prompt.id, approved);
    };

    const onClose = () => {
        onAnswer(false);
    };

    const site = siteOf(prompt.origin);

    const transaction = prompt.kind === 'transaction' ? prompt.transaction : undefined;

    // "0x" is a valid hex string and is what some pages send for a plain transfer.
    const hasData = transaction !== undefined && transaction.data.length > 2;

    const call = hasData ? readCalldata(transaction.data) : undefined;

    const risky = call?.approval === true;

    /* The contract being called is the token whose allowance is at stake, so its own decimals are
       the only ones that make the number mean anything. A contract the wallet does not track keeps
       base units rather than being formatted against a guess. */
    const subject = tokens.find((item) => item.address.toLowerCase() === (transaction?.to ?? '').toLowerCase());

    // Who the call really reaches when `to` is only a token contract: the spender of an approval,
    // or the payee of a transfer (readCalldata names one for `transfer` alone).
    const spender = call?.spender ?? '';
    const payee = call?.recipient ?? '';

    const party = spender.length > 0 ? spender : payee;

    /* The bare quantity the call names. The warning sentence names the token itself, so the symbol
       is added only where the amount stands alone, or the sentence reads "take 2500 USDT of USDT". */
    let amount = '';

    if (call?.amount !== undefined) {
        amount = subject === undefined ? call.amount.toString() : exact(formatUnits(call.amount, subject.decimals));
    }

    /* The headline states the consequence and the button repeats its verb, so the one word under the
       thumb says what pressing it does. Anything a site gets to name — a chain it is adding, a token
       symbol — is kept out of the headline and shown below it as evidence instead. */
    const ask = () => {
        if (prompt.kind === 'connect') {
            return { title: T('Dashboard.Request.ConnectTitle'), verb: T('Dashboard.Request.ConnectAction') };
        }

        if (prompt.kind === 'signature' || prompt.kind === 'typed') {
            return { title: T('Dashboard.Request.SignTitle'), verb: T('Dashboard.Request.SignAction') };
        }

        if (prompt.kind === 'chain') {
            return prompt.chain?.added === true
                ? { title: T('Dashboard.Request.AddChainTitle'), verb: T('Dashboard.Request.AddChainAction') }
                : { title: T('Dashboard.Request.SwitchTitle', isolate(prompt.summary)), verb: T('Dashboard.Request.SwitchAction') };
        }

        if (prompt.kind === 'asset') {
            return { title: T('Dashboard.Request.AssetTitle'), verb: T('Dashboard.Request.AssetAction') };
        }

        if (call?.revoke === true) {
            return { title: T('Dashboard.Request.RevokeTitle'), verb: T('Dashboard.Request.RevokeAction') };
        }

        if (risky) {
            const what = subject === undefined ? T('Dashboard.Request.AllowanceToken') : isolate(subject.symbol);

            return { title: T('Dashboard.Request.AllowTitle', what), verb: T('Dashboard.Request.AllowAction') };
        }

        if (payee.length > 0) {
            const title =
                subject === undefined || amount.length === 0
                    ? T('Dashboard.Request.SendTokensTitle')
                    : T('Dashboard.Request.SendTitle', isolate(`${amount} ${subject.symbol}`));

            return { title, verb: T('Dashboard.Request.SendAction') };
        }

        if (hasData) {
            return {
                title: T(transaction.to.length === 0 ? 'Dashboard.Request.DeployTitle' : 'Dashboard.Request.CallTitle'),
                verb: T('Dashboard.Request.ConfirmAction')
            };
        }

        return { title: T('Dashboard.Request.SendTitle', isolate(exact(transaction?.value ?? ''))), verb: T('Dashboard.Request.SendAction') };
    };

    const { title, verb } = ask();

    // On an approval the red warning below says it all, and a grey note under it would only dilute it.
    const note = risky ? '' : T(noteMap[prompt.kind]);

    const rows = (): Row[] => {
        const where = { label: T('Dashboard.Network.Title'), value: network, mono: false };

        if (transaction !== undefined) {
            const zero = /^0(?:\.0*)?\s/u.test(transaction.value);

            return [
                // A plain send already says its amount in the headline; a call that also carries
                // value is the case where that amount would otherwise go unsaid.
                ...(hasData && !zero ? [{ label: T('Dashboard.Request.Value'), value: transaction.value, mono: true }] : []),
                // A transfer of a token the wallet does not track has no decimals to format with, and
                // its headline cannot name a quantity; base units are still the true amount.
                ...(payee.length > 0 && subject === undefined && amount.length > 0 ? [{ label: T('Dashboard.Request.Value'), value: amount, mono: true }] : []),
                // "Unlimited" is a word, not an amount, and the mono face breaks its Arabic and Persian shaping.
                ...(risky && call.unlimited
                    ? [{ label: T('Dashboard.Request.Allowance'), value: T('Dashboard.Request.AllowanceUnlimited'), mono: false }]
                    : []),
                ...(risky && !call.unlimited
                    ? [{ label: T('Dashboard.Request.Allowance'), value: subject === undefined ? amount : `${amount} ${subject.symbol}`, mono: true }]
                    : []),
                ...(party.length > 0 && subject !== undefined ? [{ label: T('Dashboard.Request.AssetAddress'), value: subject.symbol, mono: false }] : []),
                ...(call === undefined
                    ? []
                    : [{ label: T('Dashboard.Request.Method'), value: call.method.length > 0 ? call.method : call.selector, mono: true }]),
                ...(transaction.fee.length > 0 ? [{ label: T('Dashboard.Request.Fee'), value: transaction.fee, mono: true }] : []),
                where,
                ...(hasData
                    ? [
                          {
                              label: T('Dashboard.Request.Data'),
                              value: T('Dashboard.Request.DataSize', call?.bytes ?? (transaction.data.length - 2) / 2),
                              mono: false
                          }
                      ]
                    : [])
            ];
        }

        if (prompt.kind === 'chain' && prompt.chain !== undefined) {
            return [{ label: T('Dashboard.Network.ChainId'), value: String(prompt.chain.id), mono: true }];
        }

        if (prompt.kind === 'asset' && prompt.asset !== undefined) {
            return [{ label: T('Dashboard.Request.AssetSymbol'), value: prompt.asset.symbol.length > 0 ? prompt.asset.symbol : '—', mono: false }, where];
        }

        return [where];
    };

    /* Never `shortAddress` for the far end. This is the screen the whole approval exists for, and a
       poisoning contract is picked to match the first and last characters a truncation keeps. */
    const route = () => {
        if (prompt.kind === 'chain' && prompt.chain !== undefined) {
            return (
                <Panel className='flex flex-col'>
                    <Stop
                        rail
                        icon={
                            <TokenIcon kind='network' src={getNativeLogo(prompt.chain.from.id)} symbol={prompt.chain.from.name} className='size-8 text-tiny' />
                        }
                        label={T('Dashboard.Request.From')}
                    >
                        <Text variant='body' className='truncate' text={prompt.chain.from.name} />
                    </Stop>

                    <Stop
                        icon={<TokenIcon kind='network' src={getNativeLogo(prompt.chain.id)} symbol={prompt.chain.name} className='size-8 text-tiny' />}
                        label={T('Dashboard.Request.To')}
                    >
                        <Text variant='body' className='wrap-break-word' text={prompt.chain.name} />
                    </Stop>
                </Panel>
            );
        }

        if (prompt.kind === 'asset') {
            return undefined;
        }

        // A transaction leaves this account for somewhere; a connection or a signature only names it.
        const target = party.length > 0 ? party : (transaction?.to ?? '');

        return (
            <Panel className='flex flex-col'>
                <Stop
                    rail={transaction !== undefined}
                    icon={
                        <IconBox tone='badge' className={cn('size-8', emoji.length > 0 && 'text-small')}>
                            {emoji.length > 0 ? emoji : <User size={14} />}
                        </IconBox>
                    }
                    label={T(transaction === undefined ? 'Dashboard.Request.Account' : 'Dashboard.Request.From')}
                >
                    <Text variant='body' className='truncate' text={name} />

                    <Text dir='ltr' className='truncate font-mono' text={shortAddress(address)} />
                </Stop>

                {transaction !== undefined && (
                    <Stop
                        icon={<IconBox className='size-8'>{spender.length > 0 ? <KeyRound size={14} /> : <ArrowDown size={14} />}</IconBox>}
                        label={T(spender.length > 0 ? 'Dashboard.Request.Spender' : 'Dashboard.Request.To')}
                    >
                        {target.length > 0 ? <AddressBlock address={target} /> : <Text variant='body' text={T('Dashboard.Request.Deploy')} />}
                    </Stop>
                )}
            </Panel>
        );
    };

    /* An approval's `to` is the token rather than the party, so it moves down here. A token the
       wallet tracks is named by its own record; anything else is shown in full to be checked. */
    const contract = party.length > 0 && subject === undefined ? (transaction?.to ?? '') : (prompt.asset?.address ?? '');

    const warning = () => {
        if (!risky) {
            return '';
        }

        const token = subject?.symbol ?? T('Dashboard.Request.AllowanceToken');

        return call.unlimited ? T('Dashboard.Request.AllowanceNoteUnlimited', token) : T('Dashboard.Request.AllowanceNote', amount, token);
    };

    const payload = prompt.kind === 'signature' || prompt.kind === 'typed' ? prompt.summary : '';

    const endpoint = prompt.kind === 'chain' && prompt.chain?.added === true ? prompt.chain.rpc : '';

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={title} titleClass='text-large' onClose={onClose} />

            <Horizontal className='items-center gap-3'>
                <SiteIcon url={prompt.origin} symbol={site.host} />

                <Vertical className='min-w-0 flex-1'>
                    <Text text={T('Dashboard.Request.RequestedBy')} />

                    <Text
                        dir='ltr'
                        variant='body'
                        className={cn('font-mono break-all', !site.secure && 'text-txt-error')}
                        text={site.secure ? site.host : prompt.origin}
                    />
                </Vertical>
            </Horizontal>

            {note.length > 0 && <Text variant='bodyMuted' text={note} />}

            <Alert variant='warning' className='text-start' text={site.secure ? '' : T('Dashboard.Request.InsecureNote')} />

            {/* Red is the product's one warning colour, so it is spent on the call that can still
                take tokens after this dialog is gone, not on every routine note. */}
            <Alert variant='error' size='comfortable' className='text-start' text={warning()} />

            <ModalBody>
                {route()}

                {contract.length > 0 && (
                    <Panel>
                        <AddressBlock label={T('Dashboard.Request.AssetAddress')} address={contract} />
                    </Panel>
                )}

                <ListCard>
                    {rows().map((item) => (
                        <Horizontal key={`${item.label}:${item.value}`} className='items-center justify-between gap-3 p-3'>
                            <Text className='shrink-0' text={item.label} />

                            <Text
                                variant='captionStrong'
                                dir={item.mono ? 'ltr' : undefined}
                                className={cn('min-w-0 truncate', item.mono && 'font-mono')}
                                text={item.value}
                            />
                        </Horizontal>
                    ))}
                </ListCard>

                {endpoint.length > 0 && (
                    <Vertical className='gap-1'>
                        <Text text={T('Dashboard.Request.ChainRpc')} />

                        <Panel>
                            <Text variant='captionStrong' dir='ltr' className='font-mono wrap-break-word' text={endpoint} />
                        </Panel>
                    </Vertical>
                )}

                {payload.length > 0 && (
                    <Vertical className='gap-1'>
                        <Text text={T('Dashboard.Request.Message')} />

                        <Vertical className='relative'>
                            <Panel ref={payloadRef} className='max-h-48 overflow-y-auto overscroll-contain'>
                                <Text variant='captionStrong' dir='ltr' className='font-mono wrap-break-word whitespace-pre-wrap' text={payload} />
                            </Panel>

                            <ScrollBar viewportRef={payloadRef} className='inset-e-2 top-2' />
                        </Vertical>
                    </Vertical>
                )}
            </ModalBody>

            {/* On an allowance the safe answer carries the weight: the expensive mistake here is the
                reflex tap on whatever looks like the primary button. */}
            <ModalActions>
                <Button
                    dim
                    variant={risky ? 'primary' : 'muted'}
                    size='action'
                    loading={answered === false}
                    disabled={answered !== undefined}
                    onClick={onClose}
                    text={T('Dashboard.Request.Reject')}
                />

                <Button
                    dim
                    variant={risky ? 'destructive' : 'primary'}
                    size='action'
                    loading={answered === true}
                    disabled={answered !== undefined}
                    onClick={() => {
                        onAnswer(true);
                    }}
                    text={verb}
                />
            </ModalActions>
        </Modal>
    );
}
