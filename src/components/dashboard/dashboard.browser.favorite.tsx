import { useState } from 'react';

import Alert from '../ui/alert';
import Button from '../ui/button';
import { TextField } from '../ui/field';
import { Modal, ModalActions, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { getSiteHost, type BrowserFavorite } from '../../core/browser';

/**
 * DashboardBrowserFavorite - The form behind adding a favourite and behind editing one.
 *
 * One dialog for both, because they differ only in what the fields start as and what the title says.
 * An `item` is the one being edited and its id is carried through untouched, so the row keeps its place
 * in the list while its address changes underneath it.
 *
 * The address is the only required field. A name left blank is filled in with the host, which is what
 * the tile would have been called anyway — asking someone to type "github.com" next to
 * `https://github.com` is asking for nothing.
 * @param {object} props Component props.
 * @param {BrowserFavorite} [props.item] The favourite being edited; absent when one is being added.
 * @param {(item: BrowserFavorite) => void} props.onSave Stores the result.
 * @param {() => void} props.onClose Closes the dialog.
 * @returns {JSX.Element} The dialog.
 */
export default function DashboardBrowserFavorite({ item, onSave, onClose }: { item?: BrowserFavorite; onSave: (item: BrowserFavorite) => void; onClose: () => void })
{
    const [ name, setName ] = useState(item?.name ?? '');
    const [ url, setUrl ] = useState(item?.url ?? '');
    const [ error, setError ] = useState('');

    const onConfirm = () =>
    {
        const typed = url.trim();

        if (typed.length === 0)
        {
            setError(T('Dashboard.Browser.FavoriteInvalid'));

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
            setError(T('Dashboard.Browser.FavoriteInvalid'));

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
                title={ item === undefined ? T('Dashboard.Browser.FavoriteAdd') : T('Dashboard.Browser.FavoriteEdit') }
                onClose={ onClose } />

            <Alert text={ error } />

            <TextField
                value={ name }
                autoComplete='off'
                placeholder={ T('Dashboard.Browser.FavoriteName') }
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
                    text={ T('Dashboard.Browser.FavoriteCancel') } />

                <Button
                    variant='primary'
                    size='action'
                    onClick={ onConfirm }
                    text={ T('Dashboard.Browser.FavoriteSave') } />

            </ModalActions>

        </Modal>
    );
}
