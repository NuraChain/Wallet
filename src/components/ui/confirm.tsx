import Text from './text';
import Button from './button';
import { Modal, ModalActions, ModalHeader } from './modal';

import { T } from '../../utility/language';
import { Vertical } from './stack';

/**
 * The gate in front of anything that deletes.
 *
 * Every removal in this app used to fire straight off a trash icon sitting one target width from a
 * benign one — rename, edit — with nothing to undo it.
 *
 * `ConfirmPanel` is the body on its own, for the screens that already live inside a dialog and
 * swap their content rather than stacking a second one on top. `ConfirmDialog` is the same body
 * with a dialog around it, for a screen that is not one already.
 */
export function ConfirmPanel({
    title,
    message,
    confirmLabel = '',
    onConfirm,
    onCancel
}: {
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Vertical className='gap-3'>
            <Text as='h3' variant='title' text={title} />

            <Text variant='bodyMuted' className='leading-relaxed' text={message} />

            <ModalActions>
                <Button variant='muted' size='action' onClick={onCancel} text={T('App.Cancel')} />

                <Button variant='destructive' size='action' onClick={onConfirm} text={confirmLabel.length > 0 ? confirmLabel : T('App.Remove')} />
            </ModalActions>
        </Vertical>
    );
}

export default function ConfirmDialog({
    title,
    message,
    confirmLabel = '',
    onConfirm,
    onCancel
}: {
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Modal onClose={onCancel}>
            <ModalHeader title={title} onClose={onCancel} />

            <Text variant='bodyMuted' className='leading-relaxed' text={message} />

            <ModalActions>
                <Button variant='muted' size='action' onClick={onCancel} text={T('App.Cancel')} />

                <Button variant='destructive' size='action' onClick={onConfirm} text={confirmLabel.length > 0 ? confirmLabel : T('App.Remove')} />
            </ModalActions>
        </Modal>
    );
}
