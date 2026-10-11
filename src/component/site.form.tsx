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

interface SiteEntry {
    id: string;
    name: string;
    url: string;
    microphone?: boolean;
    camera?: boolean;
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
    /** Offers the two device switches. Left off where the wallet is not the one a site's request comes to. */
    devices?: boolean;
    onSave: (item: SiteEntry) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState(item?.name ?? '');
    const [url, setUrl] = useState(item?.url ?? '');
    const [microphone, setMicrophone] = useState(item?.microphone === true);
    const [camera, setCamera] = useState(item?.camera === true);
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

        // A switch left off is not written at all, so a favourite saved before there were any reads
        // the same as one saved with both off.
        onSave({
            id: item?.id ?? crypto.randomUUID(),
            name: label.length > 0 ? label : getSiteHost(full),
            url: full,
            ...(microphone ? { microphone: true } : {}),
            ...(camera ? { camera: true } : {})
        });
    };

    return (
        <Modal onClose={onClose}>
            <ModalHeader title={title} onClose={onClose} />

            <Alert text={error} />

            <TextField label={T('Dashboard.Site.Name')} value={name} autoComplete='off' placeholder={T('Dashboard.Site.Name')} onValue={setName} />

            {/* `url` is what brings up a phone's address keyboard, with its slash and dot to hand. The
                field still takes a bare host: nothing here is a form for the browser to validate. */}
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

            {devices && (
                <Vertical>
                    <Text text={T('Dashboard.Site.Devices')} />

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
                </Vertical>
            )}

            <ModalActions>
                <Button variant='muted' size='action' onClick={onClose} text={T('Dashboard.Site.Cancel')} />

                <Button variant='primary' size='action' onClick={onConfirm} text={T('Dashboard.Site.Save')} />
            </ModalActions>
        </Modal>
    );
}
