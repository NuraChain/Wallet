import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';

import Text from '../components/ui/text';
import Button from '../components/ui/button';

import { line } from './boundary';
import { surfacePanel } from '../components/ui/panel';
import { Horizontal, Vertical } from '../components/ui/stack';

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
        <div className='flex size-full items-center justify-center bg-base-1 px-4'>

            <Vertical className={ `${ surfacePanel } w-full max-w-md gap-3 rounded-dialog p-6 text-center` }>

                <Text
                    variant='heading'
                    text={ line('App.Failure.Title', 'Nura Wallet could not start') } />

                <Text
                    variant='bodyMuted'
                    text={ line('App.Failure.Message', 'Your wallet is still on this device. Reloading usually clears this.') } />

                { /*
                  * The developer's half of the screen: whatever was thrown, in English, so a report can
                  * carry something more useful than "it did not open".
                  */ }
                <Text
                    dir='ltr'
                    className='rounded-surface bg-base-3 p-2 font-mono break-all select-text!'
                    text={ describe(error) } />

                <Horizontal className='gap-2'>

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

                </Horizontal>

            </Vertical>

        </div>
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
        <div className='flex size-full items-center justify-center bg-base-1 px-4'>

            <Vertical className={ `${ surfacePanel } w-full max-w-md gap-3 rounded-dialog p-6 text-center` }>

                <Text
                    variant='heading'
                    text={ line('App.Missing.Title', 'This screen does not exist') } />

                <Text
                    variant='bodyMuted'
                    text={ line('App.Missing.Message', 'Nothing was lost. Your wallet is still on this device.') } />

                <Button
                    variant='primary'
                    size='action'
                    fullWidth
                    onClick={ () => { void navigate('/', { replace: true }); } }
                    text={ line('App.Failure.Home', 'Start over') } />

            </Vertical>

        </div>
    );
}
