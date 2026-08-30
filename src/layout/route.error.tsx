import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';

import Button from '../components/ui/button';
import FailureScreen from '../components/ui/failure';

import { line } from './boundary';

const describe = (error: unknown) => {
    if (isRouteErrorResponse(error)) {
        return `${error.status} ${error.statusText}`;
    }

    if (error instanceof Error && error.message.length > 0) {
        return error.message;
    }

    return 'unknown error';
};

export default function RouteError() {
    const error = useRouteError();
    const navigate = useNavigate();

    return (
        <FailureScreen
            title={line('App.Failure.Title', 'Nura Wallet could not start')}
            body={line('App.Failure.Message', 'Your wallet is still on this device. Reloading usually clears this.')}
            detail={describe(error)}
        >
            <Button
                variant='muted'
                size='action'
                onClick={() => {
                    void navigate('/', { replace: true });
                }}
                text={line('App.Failure.Home', 'Start over')}
            />

            <Button
                variant='primary'
                size='action'
                onClick={() => {
                    window.location.reload();
                }}
                text={line('App.Failure.Reload', 'Reload')}
            />
        </FailureScreen>
    );
}

export function NotFound() {
    const navigate = useNavigate();

    return (
        <FailureScreen
            title={line('App.Missing.Title', 'This screen does not exist')}
            body={line('App.Missing.Message', 'Nothing was lost. Your wallet is still on this device.')}
        >
            <Button
                variant='primary'
                size='action'
                onClick={() => {
                    void navigate('/', { replace: true });
                }}
                text={line('App.Failure.Home', 'Start over')}
            />
        </FailureScreen>
    );
}
