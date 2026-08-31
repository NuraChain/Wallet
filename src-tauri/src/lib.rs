#[cfg(desktop)]
mod dapp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

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

        builder = builder.plugin(tauri_plugin_fs::init());

        builder = builder
            .manage(dapp::DappState::default())
            .invoke_handler(tauri::generate_handler![
                dapp::browser_open,
                dapp::dapp_request,
                dapp::dapp_respond,
                dapp::dapp_emit
            ]);
    }

    builder = builder.plugin(tauri_plugin_deep_link::init());

    builder = builder.plugin(tauri_plugin_opener::init());

    builder = builder.plugin(tauri_plugin_os::init());

    builder = builder.plugin(tauri_plugin_store::Builder::new().build());

    builder = builder.plugin(tauri_plugin_http::init());

    builder
        .run(tauri::generate_context!())
        .expect("Application Failed");
}
