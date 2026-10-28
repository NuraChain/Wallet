import { SpeedDial } from '../../ui/speeddial';

import { T } from '../../utility/language';

import type { MouseMenuItem, Point } from '../../type/app';

/** What a press of the floating mouse offers. `full` is undefined where full screen does nothing: off the browser, or on its start page. */
export const speedItems = (full: boolean | undefined): MouseMenuItem[] =>
    full === true
        ? [
              { key: 'wallet', label: T('Dashboard.Nav.Wallet'), glyph: 'wallet', disabled: false },
              { key: 'full', label: T('Dashboard.Mouse.Exit'), glyph: 'exit', disabled: false }
          ]
        : [
              { key: 'wallet', label: T('Dashboard.Nav.Wallet'), glyph: 'wallet', disabled: false },
              { key: 'browser', label: T('Dashboard.Nav.Browser'), glyph: 'browser', disabled: false },
              { key: 'full', label: T('Dashboard.Mouse.Full'), glyph: 'full', disabled: full === undefined }
          ];

/** The menu drawn in the wallet's own page, for the in-page mouse; a native mouse draws its own over the browser. */
export default function DashboardSpeed({
    at,
    open,
    full,
    onPick,
    onDismiss,
    onClose
}: {
    at: Point | undefined;
    open: boolean;
    full: boolean | undefined;
    onPick: (key: string) => void;
    onDismiss: () => void;
    onClose: () => void;
}) {
    const actions = speedItems(full).map((item) => ({
        ...item,
        onPick: () => {
            onPick(item.key);
        }
    }));

    return <SpeedDial actions={actions} at={at} open={open} onDismiss={onDismiss} onClosed={onClose} />;
}
