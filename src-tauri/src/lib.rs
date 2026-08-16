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
    }

    builder = builder.plugin(tauri_plugin_os::init());

    builder = builder.plugin(tauri_plugin_store::Builder::new().build());

    // Registered on every platform, and reachable only for the hosts the capability scope names. The
    // frontend keeps using the webview's `fetch` for everything else — this is the way around one
    // server's broken CORS header, not the app's HTTP client.
    builder = builder.plugin(tauri_plugin_http::init());

    builder
        .run(tauri::generate_context!())
        .expect("Application Failed");
}
