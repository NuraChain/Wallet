import { Globe, Maximize2, Minimize2, Wallet } from 'lucide-react';

import { SpeedDial, type SpeedAction } from '../../ui/speeddial';

import { T } from '../../utility/language';

import type { Point } from '../../type/app';

/** What a press of the floating mouse opens. `full` is undefined where full screen does nothing: off the browser, or on its start page. */
export default function DashboardSpeed({
    at,
    open,
    full,
    onWallet,
    onBrowser,
    onFull,
    onDismiss,
    onClose
}: {
    at: Point | undefined;
    open: boolean;
    full: boolean | undefined;
    onWallet: () => void;
    onBrowser: () => void;
    onFull: () => void;
    onDismiss: () => void;
    onClose: () => void;
}) {
    const actions: SpeedAction[] =
        full === true
            ? [
                  { key: 'wallet', label: T('Dashboard.Nav.Wallet'), icon: <Wallet size={22} />, onPick: onWallet },
                  { key: 'full', label: T('Dashboard.Mouse.Exit'), icon: <Minimize2 size={22} />, onPick: onFull }
              ]
            : [
                  { key: 'wallet', label: T('Dashboard.Nav.Wallet'), icon: <Wallet size={22} />, onPick: onWallet },
                  { key: 'browser', label: T('Dashboard.Nav.Browser'), icon: <Globe size={22} />, onPick: onBrowser },
                  { key: 'full', label: T('Dashboard.Mouse.Full'), icon: <Maximize2 size={22} />, disabled: full === undefined, onPick: onFull }
              ];

    return <SpeedDial actions={actions} at={at} open={open} onDismiss={onDismiss} onClosed={onClose} />;
}
