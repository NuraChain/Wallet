import { useRef, useState, type ReactNode } from 'react';
import { formatUnits } from 'ethers';
import { ArrowDown, KeyRound, User } from 'lucide-react';

import Text from '../../ui/text';
import Alert from '../../ui/alert';
import Panel from '../../ui/panel';
import Button from '../../ui/button';
import IconBox from '../../ui/iconbox';
import ListCard from '../../ui/list';
import ScrollBar from '../../ui/scrollbar';
import AddressBlock from '../../ui/address';
import SiteIcon from '../site.icon';
import TokenIcon from '../../ui/token.icon';
import { Horizontal, Vertical } from '../../ui/stack';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../../ui/modal';

import { T } from '../../utility/language';
import { shortAddress } from '../../utility/format';
import { getNativeLogo } from '../../core/price';
import { readCalldata } from '../../core/calldata';
import { resolveDappPrompt } from '../../core/dapp.rpc';
import type { DappPrompt } from '../../type/dapp';
import type { Token } from '../../type/token';
import { Rail } from '../../ui/wrap';

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
    asset: 'Dashboard.Request.AssetNote',
    microphone: 'Dashboard.Request.MicrophoneNote'
};

// Bidi-isolated, or "0.25 ETH" is reordered inside a Persian or Arabic sentence.
const isolate = (value: string) => `\u2068${value}\u2069`;

// Only the trailing ".0" goes; nothing is rounded, since hidden dust is what a drainer counts on.
const exact = (value: string) => value.replace(/\.0(?=\s|$)/u, '');

const siteOf = (origin: string) => {
    try {
        const url = new URL(origin);

        // `host` keeps punycode and `www.` (unlike getSiteHost): the defence against a lookalike domain.
        return { host: url.host, secure: url.protocol === 'https:' };
    } catch {
        return { host: origin, secure: false };
    }
};

function Stop({ icon, label, rail = false, children }: { icon: ReactNode; label: string; rail?: boolean; children: ReactNode }) {
    return (
        <Horizontal gap={3}>
            <Vertical shrink={false} align='center'>
                {icon}

                {rail && <Rail />}
            </Vertical>

            <Vertical squeeze='x' grow gap={0.5} pb={rail ? 4 : undefined}>
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
    // In an extension the queue moves on only once the worker hears back, so this blocks a second answer.
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

    // Only the called token's own decimals apply; an untracked contract stays in base units.
    const subject = tokens.find((item) => item.address.toLowerCase() === (transaction?.to ?? '').toLowerCase());

    const spender = call?.spender ?? '';
    const payee = call?.recipient ?? '';

    const party = spender.length > 0 ? spender : payee;

    let amount = '';

    if (call?.amount !== undefined) {
        amount = subject === undefined ? call.amount.toString() : exact(formatUnits(call.amount, subject.decimals));
    }

    // Nothing a site gets to name (a chain it adds, a token symbol) goes in the headline.
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

        if (prompt.kind === 'microphone') {
            return { title: T('Dashboard.Request.MicrophoneTitle'), verb: T('Dashboard.Request.AllowAction') };
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

    const note = risky ? '' : T(noteMap[prompt.kind]);

    const rows = (): Row[] => {
        const where = { label: T('Dashboard.Network.Title'), value: network, mono: false };

        if (transaction !== undefined) {
            const zero = /^0(?:\.0*)?\s/u.test(transaction.value);

            return [
                ...(hasData && !zero ? [{ label: T('Dashboard.Request.Value'), value: transaction.value, mono: true }] : []),
                ...(payee.length > 0 && subject === undefined && amount.length > 0 ? [{ label: T('Dashboard.Request.Value'), value: amount, mono: true }] : []),
                // Not mono: the mono face breaks Arabic and Persian shaping.
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

    // Never `shortAddress` here: a poisoning address matches the characters a truncation keeps.
    const route = () => {
        if (prompt.kind === 'chain' && prompt.chain !== undefined) {
            return (
                <Panel flow='column'>
                    <Stop
                        rail
                        icon={<TokenIcon kind='network' src={getNativeLogo(prompt.chain.from.id)} symbol={prompt.chain.from.name} size={8} glyph='tiny' />}
                        label={T('Dashboard.Request.From')}
                    >
                        <Text variant='body' truncate text={prompt.chain.from.name} />
                    </Stop>

                    <Stop
                        icon={<TokenIcon kind='network' src={getNativeLogo(prompt.chain.id)} symbol={prompt.chain.name} size={8} glyph='tiny' />}
                        label={T('Dashboard.Request.To')}
                    >
                        <Text variant='body' breaks='words' text={prompt.chain.name} />
                    </Stop>
                </Panel>
            );
        }

        if (prompt.kind === 'asset') {
            return undefined;
        }

        const target = party.length > 0 ? party : (transaction?.to ?? '');

        return (
            <Panel flow='column'>
                <Stop
                    rail={transaction !== undefined}
                    icon={
                        <IconBox tone='badge' size={8} glyph={emoji.length > 0 ? 'small' : undefined}>
                            {emoji.length > 0 ? emoji : <User size={14} />}
                        </IconBox>
                    }
                    label={T(transaction === undefined ? 'Dashboard.Request.Account' : 'Dashboard.Request.From')}
                >
                    <Text variant='body' truncate text={name} />

                    <Text dir='ltr' truncate mono text={shortAddress(address)} />
                </Stop>

                {transaction !== undefined && (
                    <Stop
                        icon={<IconBox size={8}>{spender.length > 0 ? <KeyRound size={14} /> : <ArrowDown size={14} />}</IconBox>}
                        label={T(spender.length > 0 ? 'Dashboard.Request.Spender' : 'Dashboard.Request.To')}
                    >
                        {target.length > 0 ? <AddressBlock address={target} /> : <Text variant='body' text={T('Dashboard.Request.Deploy')} />}
                    </Stop>
                )}
            </Panel>
        );
    };

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
            <ModalHeader title={title} titleSize='large' onClose={onClose} />

            <Horizontal align='center' gap={3}>
                <SiteIcon url={prompt.origin} symbol={site.host} />

                <Vertical squeeze='x' grow>
                    <Text text={T('Dashboard.Request.RequestedBy')} />

                    <Text dir='ltr' variant='body' mono breaks='all' tone={site.secure ? undefined : 'error'} text={site.secure ? site.host : prompt.origin} />
                </Vertical>
            </Horizontal>

            {note.length > 0 && <Text variant='bodyMuted' text={note} />}

            <Alert variant='warning' textAlign='start' text={site.secure ? '' : T('Dashboard.Request.InsecureNote')} />

            <Alert variant='error' size='comfortable' textAlign='start' text={warning()} />

            {prompt.kind !== 'microphone' && (
                <ModalBody>
                    {route()}

                    {contract.length > 0 && (
                        <Panel>
                            <AddressBlock label={T('Dashboard.Request.AssetAddress')} address={contract} />
                        </Panel>
                    )}

                    <ListCard>
                        {rows().map((item) => (
                            <Horizontal key={`${item.label}:${item.value}`} align='center' justify='between' gap={3} p={3}>
                                <Text shrink={false} text={item.label} />

                                <Text variant='captionStrong' dir={item.mono ? 'ltr' : undefined} squeeze='x' truncate mono={item.mono} text={item.value} />
                            </Horizontal>
                        ))}
                    </ListCard>

                    {endpoint.length > 0 && (
                        <Vertical gap={1}>
                            <Text text={T('Dashboard.Request.ChainRpc')} />

                            <Panel>
                                <Text variant='captionStrong' dir='ltr' mono breaks='words' text={endpoint} />
                            </Panel>
                        </Vertical>
                    )}

                    {payload.length > 0 && (
                        <Vertical gap={1}>
                            <Text text={T('Dashboard.Request.Message')} />

                            <Vertical relative>
                                <Panel ref={payloadRef} bounded>
                                    <Text variant='captionStrong' dir='ltr' mono breaks='words' pre text={payload} />
                                </Panel>

                                <ScrollBar viewportRef={payloadRef} edge='inset' />
                            </Vertical>
                        </Vertical>
                    )}
                </ModalBody>
            )}

            {/* On an allowance Reject is the primary button, against a reflex tap. */}
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
