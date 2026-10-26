import { Logo } from '../../ui/media';
import { RingMenu } from '../../ui/ring';

import { T } from '../../utility/language';

/** What a press of the floating mouse opens. `full` is undefined where full screen does nothing: off the browser, or on its start page. */
export default function DashboardRing({
    full,
    onWallet,
    onBrowser,
    onFull,
    onClose
}: {
    full: boolean | undefined;
    onWallet: () => void;
    onBrowser: () => void;
    onFull: () => void;
    onClose: () => void;
}) {
    return (
        <RingMenu
            hub={<Logo size={10} />}
            hubLabel={T('App.Close')}
            onClose={onClose}
            choices={[
                { key: 'wallet', label: T('Dashboard.Nav.Wallet'), onPick: onWallet },
                { key: 'browser', label: T('Dashboard.Nav.Browser'), onPick: onBrowser },
                { key: 'full', label: T(full === true ? 'Dashboard.Mouse.Exit' : 'Dashboard.Mouse.Full'), disabled: full === undefined, onPick: onFull }
            ]}
        />
    );
}
