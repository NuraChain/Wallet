import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';

import Button from '../components/ui/button';
import FailureScreen from '../components/ui/failure';

import { line } from './boundary';

/**
 * describe - Turns whatever the router caught into one line worth showing.
 *
 * A route can fail in three shapes: a thrown `Response` (what `redirect` and `throw new Response`
 * produce), a real `Error`, or something else entirely. Only the middle one carries a message, so the
 * other two get named rather than rendered as `[object Object]`.
 * @param {unknown} error Whatever the router caught.
 * @returns {string} A single descriptive line.
 */
const describe = (error: unknown) =>
{
    if (isRouteErrorResponse(error))
    {
        return `${ error.status } ${ error.statusText }`;
    }

    if (error instanceof Error && error.message.length > 0)
    {
        return error.message;
    }

    return 'unknown error';
};

/**
 * RouteError - The failure screen for one route, with the shell still standing around it.
 *
 * This is the difference the router buys over the old page bus. [boundary.tsx](boundary.tsx) is still
 * there and still catches anything the shell itself throws, but it can only offer a reload, because by
 * the time it runs the whole tree is gone. A route-level error leaves `RootLayout` mounted, so the
 * title bar stays, the window still looks like the app, and "go back" is a real option rather than a
 * restart.
 * @returns {JSX.Element} The route failure screen.
 */
export default function RouteError()
{
    const error = useRouteError();
    const navigate = useNavigate();

    return (
        <FailureScreen
            title={ line('App.Failure.Title', 'Nura Wallet could not start') }
            body={ line('App.Failure.Message', 'Your wallet is still on this device. Reloading usually clears this.') }
            detail={ describe(error) }>

            <Button
                variant='muted'
                size='action'
                onClick={ () => { void navigate('/', { replace: true }); } }
                text={ line('App.Failure.Home', 'Start over') } />

            <Button
                variant='primary'
                size='action'
                onClick={ () => { window.location.reload(); } }
                text={ line('App.Failure.Reload', 'Reload') } />

        </FailureScreen>
    );
}

/**
 * NotFound - The route that catches a path nothing else claimed.
 *
 * Unreachable by normal use — navigation is all in-process and there is no address bar to mistype
 * into — so this is a backstop for a bad `navigate()` call rather than a screen anyone should meet.
 * It says so plainly instead of showing a web-style 404.
 * @returns {JSX.Element} The not-found screen.
 */
export function NotFound()
{
    const navigate = useNavigate();

    return (
        <FailureScreen
            title={ line('App.Missing.Title', 'This screen does not exist') }
            body={ line('App.Missing.Message', 'Nothing was lost. Your wallet is still on this device.') }>

            <Button
                variant='primary'
                size='action'
                onClick={ () => { void navigate('/', { replace: true }); } }
                text={ line('App.Failure.Home', 'Start over') } />

        </FailureScreen>
    );
}
