// The in-app provider's desktop transport. Android reaches the same behaviour through
// `BrowserBridge.kt`, so nothing here is compiled into that build.
#[cfg(desktop)]
mod dapp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Registered before every other plugin, as the plugin requires: it has to claim the instance
    // lock before the rest of the setup runs, otherwise a second launch races the first instance.
    //
    // Closing the window hides it rather than quitting (see the title bar and the tray), so a second
    // launch nearly always means "give me back the window I hid" — unminimize, show, focus.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));

        builder = builder.on_tray_icon_event(|app, event| match event {
            tauri::tray::TrayIconEvent::DoubleClick { .. } => {
                if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }

            _ => {}
        });

        // Only the recovery-phrase export writes files, and only into the two directories the
        // capability grants. Android does the same job through MediaStore instead, so it never
        // registers this.
        builder = builder.plugin(tauri_plugin_fs::init());

        // The in-app provider. `dapp_request` is the one command a visited page can reach, and the
        // only one granted to a remote origin by `browser-capability`; the other three are the
        // wallet driving its own browser and are refused to anything but the main webview.
        //
        // The queue behind them holds one channel per call a page is waiting on, which is why it is
        // managed state rather than a static: it has to outlive each command and be shared by the
        // command that answers it.
        builder = builder
            .manage(dapp::DappState::default())
            .invoke_handler(tauri::generate_handler![
                dapp::browser_open,
                dapp::dapp_request,
                dapp::dapp_respond,
                dapp::dapp_emit
            ]);
    }

    builder = builder.plugin(tauri_plugin_os::init());

    builder = builder.plugin(tauri_plugin_store::Builder::new().build());

    // How the frontend reads every API it talks to: the explorers, the price feed, the history
    // fallback, and whatever address a user puts behind a custom network. Requests are made here,
    // where there is no origin and no preflight, so none of that data hangs on a third party's CORS
    // header being right.
    //
    // The capability scope grants `http://*` and `https://*`, so this is a general HTTP client and
    // there is no host list left to check it against. What still bounds it is the capability itself:
    // `main-capability` sets no `remote` block and `local` defaults to true, so only this app's own
    // frontend can reach it — a page opened in the browser tab is a remote URL and gets nothing.
    //
    // The one thing such a page can reach is `dapp_request` below, granted to it by the separate
    // `browser-capability`. That capability lists no plugin scopes, so it opens no route to this.
    builder = builder.plugin(tauri_plugin_http::init());

    builder
        .run(tauri::generate_context!())
        .expect("Application Failed");
}
