import { Component, type ReactNode } from 'react';

import Button from '../components/ui/button';
import FailureScreen from '../components/ui/failure';

import { T } from '../utility/language';

export const line = (key: string, fallback: string) => {
    const value = T(key);

    return value === `[${key}]` ? fallback : value;
};

interface BoundaryProps {
    children: ReactNode;
}

interface BoundaryState {
    message: string;
}

export default class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
    public override state: BoundaryState = { message: '' };

    public static getDerivedStateFromError(error: unknown): BoundaryState {
        return { message: error instanceof Error && error.message.length > 0 ? error.message : 'unknown error' };
    }

    public override render(): ReactNode {
        const { message } = this.state;

        if (message.length === 0) {
            return this.props.children;
        }

        return (
            <FailureScreen
                title={line('App.Failure.Title', 'Nura Wallet could not start')}
                body={line('App.Failure.Message', 'Your wallet is still on this device. Reloading usually clears this.')}
                detail={message}
            >
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
}
