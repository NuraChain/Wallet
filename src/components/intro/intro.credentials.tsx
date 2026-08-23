import { useState } from 'react';

import Button from '../ui/button';
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
        catch
        {
            // The flow this hands off to writes the vault. A rejection there used to land nowhere:
            // the spinner stopped, the button came back, and the wallet had not been saved — the one
            // failure in the app where saying nothing leaves the user believing the opposite of what
            // happened. `ErrorGenerate` exists under both prefixes and is worded for each flow.
            onError(T(`${ prefix }.ErrorGenerate`));
        }
        finally
        {
            setLoading(false);
        }
    };

    return (
        <div className={ cn('flex flex-col gap-2', className) }>

            { /*
              * Both fields name themselves to the password manager. Without `autoComplete` a manager
              * sees three indistinguishable password boxes across the app and cannot tell the one
              * being set from the one being entered.
              */ }
            <PasswordField
                label={ T(`${ prefix }.Password`) }
                value={ password }
                autoComplete='new-password'
                onValue={ setPassword }
                onEnter={ () => { void onSend(); } } />

            <PasswordField
                label={ T(`${ prefix }.Confirm`) }
                value={ confirm }
                autoComplete='new-password'
                onValue={ setConfirm }
                onEnter={ () => { void onSend(); } } />

            <Checkbox
                checked={ agree }
                onToggle={ () => { setAgree(!agree); } }
                text={ T(`${ prefix }.Agreement`) } />

            <Button
                dim
                variant='primary'
                size='submit'
                loading={ loading }
                disabled={ !agree }
                onClick={ () => { void onSend(); } }
                text={ T(`${ prefix }.${ submitKey }`) }
                className={ cn('mx-auto sm:w-fit sm:px-8', submitClass) } />

        </div>
    );
}
