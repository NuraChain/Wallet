import { Component, type ReactNode } from 'react';

import Button from '../components/ui/button';
import FailureScreen from '../components/ui/failure';

import { T } from '../utility/language';

/**
 * line - A translated string, with an English one behind it.
 *
 * Every other surface in the app calls `T()` and lets a missing key render as `[Dotted.Key]`, which is
 * the right behaviour when a gap in a bundle should be visible. This screen is the exception: the
 * language bundle failing to load is one of the things that can put the app here in the first place,
 * and a failure screen that cannot say what happened is not a failure screen.
 * @param {string} key The translation key.
 * @param {string} fallback What to show when the bundle has nothing under that key.
 * @returns {string} The translated line, or the fallback.
 */
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

/**
 * ErrorBoundary - The wall between one component throwing and the user facing a blank window.
 *
 * React unmounts the entire tree when a render throws and nothing catches it, which on a desktop app is
 * an empty window with no way back and nothing said. That is the worst outcome this app has: a wallet
 * that will not open looks exactly like a wallet that lost everything, and the keys are sitting safely
 * on disk the whole time.
 *
 * So this catches, states that something failed, and offers the one recovery that costs nothing —
 * reloading the webview. Nothing here reads storage, the network or the clock, because the point of a
 * last resort is that it has no way left to fail.
 *
 * A class, and the only one in `src/`: `getDerivedStateFromError` has no hook equivalent.
 */
export default class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
    public override state: BoundaryState = { message: '' };

    /**
     * getDerivedStateFromError - Turns a thrown value into the state that renders the failure screen.
     * @param {unknown} error Whatever was thrown.
     * @returns {BoundaryState} The state carrying its message.
     */
    public static getDerivedStateFromError(error: unknown): BoundaryState {
        return { message: error instanceof Error && error.message.length > 0 ? error.message : 'unknown error' };
    }

    /**
     * render - The tree, or the failure screen once something in it has thrown.
     * @returns {ReactNode} What to show.
     */
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
