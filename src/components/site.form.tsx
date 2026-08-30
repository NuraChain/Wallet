import { useState } from 'react';

import Alert from './ui/alert';
import Button from './ui/button';
import { TextField } from './ui/field';
import { Modal, ModalActions, ModalHeader } from './ui/modal';

import { T } from '../utility/language';
import { getSiteHost } from '../core/browser';

interface SiteEntry {
    id: string;
    name: string;
    url: string;
}

export default function SiteForm({
    title,
    item,
    onSave,
    onClose
}: {
    title: string;
    item?: SiteEntry;
    onSave: (item: SiteEntry) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState(item?.name ?? '');
    const [url, setUrl] = useState(item?.url ?? '');
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

        onSave({ id: item?.id ?? crypto.randomUUID(), name: label.length > 0 ? label : getSiteHost(full), url: full });
    };

    return (
        <Modal onClose={onClose}>
            <ModalHeader title={title} onClose={onClose} />

            <Alert text={error} />

            <TextField label={T('Dashboard.Site.Name')} value={name} autoComplete='off' placeholder={T('Dashboard.Site.Name')} onValue={setName} />

            <TextField dir='ltr' label={T('Dashboard.Site.Url')} value={url} spellCheck={false} autoComplete='off' placeholder='https://…' onValue={setUrl} />

            <ModalActions>
                <Button variant='muted' size='action' onClick={onClose} text={T('Dashboard.Site.Cancel')} />

                <Button variant='primary' size='action' onClick={onConfirm} text={T('Dashboard.Site.Save')} />
            </ModalActions>
        </Modal>
    );
}
