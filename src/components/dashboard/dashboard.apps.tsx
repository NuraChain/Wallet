import { MdDragIndicator } from 'react-icons/md';
import { Reorder, useDragControls } from 'motion/react';
import { useEffect, useState } from 'react';
import { FiCheck, FiEdit3, FiPlus, FiTrash2 } from 'react-icons/fi';

import Text from '../ui/text';
import Button from '../ui/button';
import SiteForm from '../site.form';
import StatusBlock from '../ui/state';
import TokenIcon from '../token.icon';
import SectionHeader from '../ui/section';

import { T } from '../../utility/language';
import { loadConnections, siteOrigin } from '../../core/dapp';
import { getSiteHost, getSiteIcon } from '../../core/browser';
import { getApps, setApps, type DappEntry } from '../../core/apps';
import { Horizontal, Vertical } from '../ui/stack';

function AppIcon({ item, className }: { item: DappEntry; className: string }) {
    return <TokenIcon primary kind='unknown' src={getSiteIcon(item.url)} symbol={item.name} className={className} />;
}

function AppHost({ item, connected }: { item: DappEntry; connected: boolean }) {
    return (
        <Horizontal className='min-w-0 items-center gap-1.5'>
            {connected && <span aria-hidden className='size-1.5 shrink-0 rounded-xs bg-txt-success' />}

            <Text variant='caption' dir='ltr' className='min-w-0 flex-1 truncate font-mono' text={getSiteHost(item.url)} />
        </Horizontal>
    );
}

function AppRow({
    item,
    connected,
    onEdit,
    onRemove
}: {
    item: DappEntry;
    connected: boolean;
    onEdit: (item: DappEntry) => void;
    onRemove: (id: string) => void;
}) {
    const controls = useDragControls();

    return (
        <Reorder.Item as='div' value={item} dragListener={false} dragControls={controls} className='flex items-center gap-2'>
            <Button
                variant='muted'
                size='icon'
                onPointerDown={(event) => {
                    controls.start(event);
                }}
                aria-label={T('Dashboard.Apps.Reorder')}
                className='shrink-0 cursor-grab touch-none text-txt-muted active:cursor-grabbing'
            >
                <MdDragIndicator size={18} />
            </Button>

            <Button
                variant='muted'
                title={item.url}
                onClick={() => {
                    onEdit(item);
                }}
                className='min-w-0 flex-1 justify-start gap-2.5 rounded-surface p-2 text-start'
            >
                <AppIcon item={item} className='size-8 rounded-control text-tiny' />

                <Vertical className='min-w-0 flex-1 gap-0.5'>
                    <Text variant='body' className='truncate' text={item.name} />

                    <AppHost item={item} connected={connected} />
                </Vertical>
            </Button>

            <Button
                variant='danger'
                size='icon'
                onClick={() => {
                    onRemove(item.id);
                }}
                aria-label={T('Dashboard.Apps.Remove')}
                className='shrink-0'
            >
                <FiTrash2 size={16} />
            </Button>
        </Reorder.Item>
    );
}

export default function DashboardApps({ active, onOpen }: { active: boolean; onOpen: (url: string) => void }) {
    const [apps, setList] = useState<DappEntry[]>([]);
    const [granted, setGranted] = useState<string[]>([]);
    const [editing, setEditing] = useState(false);

    const [editor, setEditor] = useState<DappEntry | boolean>(false);

    useEffect(() => {
        let alive = true;

        void getApps().then((stored) => {
            if (alive) {
                setList(stored);
            }
        });

        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!active) {
            return undefined;
        }

        let alive = true;

        void loadConnections().then((list) => {
            if (alive) {
                setGranted(list);
            }
        });

        return () => {
            alive = false;
        };
    }, [active]);

    const commit = (list: DappEntry[]) => {
        setList(list);

        void setApps(list);
    };

    const onSave = (item: DappEntry) => {
        const known = apps.some((entry) => entry.id === item.id);

        commit(known ? apps.map((entry) => (entry.id === item.id ? item : entry)) : [...apps, item]);

        setEditor(false);
    };

    const isGranted = (item: DappEntry) => granted.includes(siteOrigin(item.url));

    const tileTitle = (item: DappEntry) => (isGranted(item) ? `${item.url} — ${T('Dashboard.Apps.Connected')}` : item.url);

    return (
        <Vertical className='mt-2 gap-4'>
            <SectionHeader title={T('Dashboard.Apps.Title')}>
                <Button
                    variant='muted'
                    size='small'
                    onClick={() => {
                        setEditing(!editing);
                    }}
                    leftIcon={editing ? <FiCheck size={14} /> : <FiEdit3 size={14} />}
                    text={editing ? T('Dashboard.Apps.Done') : T('Dashboard.Apps.Manage')}
                />
            </SectionHeader>

            {editing ? (
                <Vertical className='gap-2'>
                    {apps.length > 1 && <Text variant='caption' text={T('Dashboard.Apps.Reorder')} />}

                    <Reorder.Group as='div' axis='y' values={apps} onReorder={commit} className='flex flex-col gap-2'>
                        {apps.map((item) => (
                            <AppRow
                                key={item.id}
                                item={item}
                                connected={isGranted(item)}
                                onEdit={setEditor}
                                onRemove={(id) => {
                                    commit(apps.filter((entry) => entry.id !== id));
                                }}
                            />
                        ))}
                    </Reorder.Group>

                    <Button
                        variant='normal'
                        size='action'
                        onClick={() => {
                            setEditor(true);
                        }}
                        leftIcon={<FiPlus size={16} />}
                        text={T('Dashboard.Apps.Add')}
                    />
                </Vertical>
            ) : (
                <div className='grid grid-cols-2 gap-3 empty:hidden'>
                    {apps.map((item) => (
                        <Button
                            key={item.id}
                            variant='chip'
                            title={tileTitle(item)}
                            onClick={() => {
                                onOpen(item.url);
                            }}
                            className='h-30 flex-col items-start justify-start gap-3 rounded-surface p-3 text-start'
                        >
                            <AppIcon item={item} className='size-10 rounded-surface text-small' />

                            <Vertical className='mt-auto w-full min-w-0 gap-1'>
                                <Text variant='body' className='w-full truncate' text={item.name} />

                                <AppHost item={item} connected={isGranted(item)} />
                            </Vertical>
                        </Button>
                    ))}
                </div>
            )}

            {!editing && apps.length === 0 && (
                <Vertical className='gap-3'>
                    <StatusBlock panel text={T('Dashboard.Apps.Empty')} />

                    <Button
                        variant='normal'
                        size='action'
                        onClick={() => {
                            setEditor(true);
                        }}
                        leftIcon={<FiPlus size={16} />}
                        text={T('Dashboard.Apps.Add')}
                    />
                </Vertical>
            )}

            {editor !== false && (
                <SiteForm
                    item={editor === true ? undefined : editor}
                    title={editor === true ? T('Dashboard.Apps.Add') : T('Dashboard.Apps.Edit')}
                    onSave={onSave}
                    onClose={() => {
                        setEditor(false);
                    }}
                />
            )}
        </Vertical>
    );
}
