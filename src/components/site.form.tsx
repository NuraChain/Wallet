import { useState } from 'react';

import Alert from './ui/alert';
import Button from './ui/button';
import { TextField } from './ui/field';
import { Modal, ModalActions, ModalHeader } from './ui/modal';

import { T } from '../utility/language';
import { getSiteHost } from '../core/browser';

/**
 * A named address, which is the whole of what this form edits.
 *
 * Structural on purpose: a browser favourite and a dApp on the apps tab are each exactly this, and
 * neither has to import the other's type to be edited here.
 */
export interface SiteEntry { id: string; name: string; url: string }

/**
 * SiteForm - The dialog behind adding a named address and behind editing one.
 *
 * One dialog for adding and editing, because they differ only in what the fields start as and what the
 * title says — and one dialog for the browser's favourites and the apps tab, because a shortcut and a
 * dApp are the same two fields with a different heading over them. The heading comes in as a string so
 * each list keeps its own words for what it holds.
 *
 * An `item` is the entry being edited and its id is carried through untouched, so the row keeps its
 * place in the list while its address changes underneath it.
 *
 * The address is the only required field. A name left blank is filled in with the host, which is what
 * the tile would have been called anyway — asking someone to type "github.com" next to
 * `https://github.com` is asking for nothing.
 * @param {object} props Component props.
 * @param {string} props.title The dialog heading, already localized by the caller.
 * @param {SiteEntry} [props.item] The entry being edited; absent when one is being added.
 * @param {(item: SiteEntry) => void} props.onSave Stores the result.
 * @param {() => void} props.onClose Closes the dialog.
 * @returns {JSX.Element} The dialog.
 */
export default function SiteForm({ title, item, onSave, onClose }: { title: string; item?: SiteEntry; onSave: (item: SiteEntry) => void; onClose: () => void })
{
    const [ name, setName ] = useState(item?.name ?? '');
    const [ url, setUrl ] = useState(item?.url ?? '');
    const [ error, setError ] = useState('');

    const onConfirm = () =>
    {
        const typed = url.trim();

        if (typed.length === 0)
        {
            setError(T('Dashboard.Site.Invalid'));

            return;
        }

        // A bare host is what someone types, and it is not a URL until it has a scheme. `https` rather
        // than `http`, matching what the address bar does with the same input.
        const full = (/^[a-z][a-z0-9+.-]*:\/\//iu).test(typed) ? typed : `https://${ typed }`;

        try
        {
            void new URL(full);
        }
        catch
        {
            setError(T('Dashboard.Site.Invalid'));

            return;
        }

        const label = name.trim();

        // A random id rather than a counted one: a counter would have to be stored too, and a list that
        // has had entries removed cannot recover it from what is left.
        onSave({ id: item?.id ?? crypto.randomUUID(), name: label.length > 0 ? label : getSiteHost(full), url: full });
    };

    return (
        <Modal onClose={ onClose }>

            <ModalHeader
                title={ title }
                onClose={ onClose } />

            <Alert text={ error } />

            <TextField
                value={ name }
                autoComplete='off'
                placeholder={ T('Dashboard.Site.Name') }
                onValue={ setName } />

            <TextField
                dir='ltr'
                value={ url }
                spellCheck={ false }
                autoComplete='off'
                placeholder='https://…'
                onValue={ setUrl } />

            <ModalActions>

                <Button
                    variant='muted'
                    size='action'
                    onClick={ onClose }
                    text={ T('Dashboard.Site.Cancel') } />

                <Button
                    variant='primary'
                    size='action'
                    onClick={ onConfirm }
                    text={ T('Dashboard.Site.Save') } />

            </ModalActions>

        </Modal>
    );
}
