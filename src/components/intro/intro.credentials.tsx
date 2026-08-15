import { useState } from 'react';

import Button from '../ui/button';
import Spinner from '../ui/spinner';
import Checkbox from '../ui/checkbox';

import { PasswordField } from '../ui/field';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { passwordIssue } from '../../core/password';

/**
 * Which key under the flow's prefix explains each broken rule.
 */
const issueMap =
{
    mismatch: 'ErrorMismatch',
    length: 'ErrorLength'
} as const;

/**
 * IntroCredentials - Choose the password that will guard the wallet.
 *
 * Creating a wallet and importing one are different flows that ask the same question, and they asked
 * it with two identical copies of this block: password, confirmation, the agreement tick, and a
 * submit that spins. The copies also each enforced the length and match rules themselves, which is
 * the dangerous half — a password accepted here can never be changed, so the two paths have to agree.
 *
 * The fields' state lives here and only the accepted password leaves, through `onSubmit`. Errors go
 * back out through `onError` rather than being drawn here, because the two flows show them in
 * different places: above the sheet for the import wizard, under the header for creation.
 *
 * Strings are resolved from `prefix`, so a flow supplies `Intro.CreateWallet` and gets its own
 * labels, agreement text and error messages without this component knowing which flow it is.
 * @param {object} props Component props.
 * @param {string} props.prefix Translation prefix of the flow, e.g. `Intro.CreateWallet`.
 * @param {string} props.submitKey Key of the submit label under that prefix.
 * @param {string} [props.className] Extra classes for the group.
 * @param {string} [props.submitClass] Extra classes for the submit button.
 * @param {(message: string) => void} props.onError Reports a broken rule, or an empty string to clear.
 * @param {(password: string) => Promise<void>} props.onSubmit Runs the flow with the accepted password.
 * @returns {JSX.Element} The credentials form.
 */
export default function IntroCredentials({ prefix, submitKey, className = '', submitClass = '', onError, onSubmit }: { prefix: string; submitKey: string; className?: string; submitClass?: string; onError: (message: string) => void; onSubmit: (password: string) => Promise<void> })
{
    const [ agree, setAgree ] = useState(false);
    const [ loading, setLoading ] = useState(false);
    const [ confirm, setConfirm ] = useState('');
    const [ password, setPassword ] = useState('');

    const onSend = async() =>
    {
        if (loading)
        {
            return;
        }

        const issue = passwordIssue(password, confirm);

        if (issue !== undefined)
        {
            onError(T(`${ prefix }.${ issueMap[issue] }`));

            return;
        }

        onError('');

        setLoading(true);

        try
        {
            await onSubmit(password);
        }
        finally
        {
            setLoading(false);
        }
    };

    return (
        <div className={ cn('flex flex-col gap-2', className) }>

            <PasswordField
                label={ T(`${ prefix }.Password`) }
                value={ password }
                onValue={ setPassword }
                className='rounded-lg' />

            <PasswordField
                label={ T(`${ prefix }.Confirm`) }
                value={ confirm }
                onValue={ setConfirm }
                className='rounded-lg' />

            <Checkbox
                checked={ agree }
                onToggle={ () => { setAgree(!agree); } }
                text={ T(`${ prefix }.Agreement`) } />

            <Button
                variant='primary'
                disabled={ !agree }
                onClick={ () => { void onSend(); } }
                className={ cn('mx-auto h-12 w-full rounded-lg px-4 py-2 sm:w-fit sm:px-8', !agree && 'opacity-50', submitClass) }>

                {
                    !loading ? T(`${ prefix }.${ submitKey }`) : <Spinner size={ 24 } />
                }

            </Button>

        </div>
    );
}
