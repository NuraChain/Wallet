import { useState } from 'react';

import Button from '../ui/button';
import Checkbox from '../ui/checkbox';

import { PasswordField } from '../ui/field';
import { Vertical } from '../ui/stack';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { passwordIssue } from '../../core/password';

const issueMap = {
    mismatch: 'ErrorMismatch',
    length: 'ErrorLength'
} as const;

export default function IntroCredentials({
    prefix,
    submitKey,
    className = '',
    submitClass = '',
    onError,
    onSubmit
}: {
    prefix: string;
    submitKey: string;
    className?: string;
    submitClass?: string;
    onError: (message: string) => void;
    onSubmit: (password: string) => Promise<void>;
}) {
    const [agree, setAgree] = useState(false);
    const [loading, setLoading] = useState(false);
    const [confirm, setConfirm] = useState('');
    const [password, setPassword] = useState('');

    const onSend = async () => {
        if (loading) {
            return;
        }

        const issue = passwordIssue(password, confirm);

        if (issue !== undefined) {
            onError(T(`${prefix}.${issueMap[issue]}`));

            return;
        }

        onError('');

        setLoading(true);

        try {
            await onSubmit(password);
        } catch {
            onError(T(`${prefix}.ErrorGenerate`));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Vertical className={cn('gap-2', className)}>
            <PasswordField
                label={T(`${prefix}.Password`)}
                value={password}
                autoComplete='new-password'
                onValue={setPassword}
                onEnter={() => {
                    void onSend();
                }}
            />

            <PasswordField
                label={T(`${prefix}.Confirm`)}
                value={confirm}
                autoComplete='new-password'
                onValue={setConfirm}
                onEnter={() => {
                    void onSend();
                }}
            />

            <Checkbox
                checked={agree}
                onToggle={() => {
                    setAgree(!agree);
                }}
                text={T(`${prefix}.Agreement`)}
            />

            <Button
                dim
                variant='primary'
                size='submit'
                loading={loading}
                disabled={!agree}
                onClick={() => {
                    void onSend();
                }}
                text={T(`${prefix}.${submitKey}`)}
                className={cn('mx-auto sm:w-fit sm:px-8', submitClass)}
            />
        </Vertical>
    );
}
