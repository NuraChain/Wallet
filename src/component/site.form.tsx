import { useState } from 'react';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import Checkbox from '../ui/checkbox';
import { TextField } from '../ui/field';
import { Vertical } from '../ui/stack';
import { Modal, ModalActions, ModalHeader } from '../ui/modal';

import { T } from '../utility/language';
import { getSiteHost } from '../core/browser';
import { askNoticePermission } from '../core/notice';

interface SiteEntry {
    id: string;
    name: string;
    url: string;
    microphone?: boolean;
    camera?: boolean;
    notifications?: boolean;
}

export default function SiteForm({
    title,
    item,
    devices = false,
    onSave,
    onClose
}: {
    title: string;
    item?: SiteEntry;
    devices?: boolean;
    onSave: (item: SiteEntry) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState(item?.name ?? '');
    const [url, setUrl] = useState(item?.url ?? '');
    const [microphone, setMicrophone] = useState(item?.microphone === true);
    const [camera, setCamera] = useState(item?.camera === true);
    const [notifications, setNotifications] = useState(item?.notifications === true);
    const [error, setError] = useState('');

    const onConfirm = () => {
        const typed = url.trim();

        if (typed.length === 0) {
            setError(T('Dashboard.Site.Invalid'));

            return;
        }

        const full = /^[a-z][a-z0-9+.-]*:\/\//iu.test(typed) ? typed : `https://${typed}`;

        try {
            void new URL(full);
        } catch {
            setError(T('Dashboard.Site.Invalid'));

            return;
        }

        const label = name.trim();

        // A switch left off is not written, so an older favourite reads the same as both off.
        onSave({
            id: item?.id ?? crypto.randomUUID(),
            name: label.length > 0 ? label : getSiteHost(full),
            url: full,
            ...(microphone ? { microphone: true } : {}),
            ...(camera ? { camera: true } : {}),
            ...(notifications ? { notifications: true } : {})
        });
    };

    return (
        <Modal onClose={onClose}>
            <ModalHeader title={title} onClose={onClose} />

            <Alert text={error} />

            <TextField label={T('Dashboard.Site.Name')} value={name} autoComplete='off' placeholder={T('Dashboard.Site.Name')} onValue={setName} />

            {/* `url` brings up a phone's address keyboard; a bare host is still accepted. */}
            <TextField
                type='url'
                inputMode='url'
                dir='ltr'
                label={T('Dashboard.Site.Url')}
                value={url}
                spellCheck={false}
                autoCapitalize='none'
                autoComplete='off'
                placeholder='https://…'
                onValue={setUrl}
            />

            {/* Notifications reach the wallet through the page's own script on every host; devices only through Android's bridge. */}
            <Vertical>
                <Text text={T('Dashboard.Site.Devices')} />

                {devices && (
                    <>
                        <Checkbox
                            checked={microphone}
                            text={T('Dashboard.Site.Microphone')}
                            onToggle={() => {
                                setMicrophone(!microphone);
                            }}
                        />

                        <Checkbox
                            checked={camera}
                            text={T('Dashboard.Site.Camera')}
                            onToggle={() => {
                                setCamera(!camera);
                            }}
                        />
                    </>
                )}

                <Checkbox
                    checked={notifications}
                    text={T('Dashboard.Site.Notifications')}
                    onToggle={() => {
                        if (!notifications) {
                            void askNoticePermission();
                        }

                        setNotifications(!notifications);
                    }}
                />
            </Vertical>

            <ModalActions>
                <Button variant='muted' size='action' onClick={onClose} text={T('Dashboard.Site.Cancel')} />

                <Button variant='primary' size='action' onClick={onConfirm} text={T('Dashboard.Site.Save')} />
            </ModalActions>
        </Modal>
    );
}
