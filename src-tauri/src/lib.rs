#[cfg(desktop)]
mod dapp;

#[cfg(target_os = "linux")]
mod camera;

#[cfg(target_os = "linux")]
mod stage;

#[cfg(any(target_os = "ios", target_os = "macos"))]
mod keychain;

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
                dapp::browser_clear,
                #[cfg(target_os = "linux")]
                dapp::browser_place,
                #[cfg(target_os = "linux")]
                dapp::browser_position,
                dapp::dapp_request,
                dapp::dapp_respond,
                dapp::dapp_emit,
                #[cfg(target_os = "macos")]
                keychain::biometric_seal,
                #[cfg(target_os = "macos")]
                keychain::biometric_open,
                #[cfg(target_os = "macos")]
                keychain::biometric_forget
            ]);

        // Runs while the window still holds only the wallet, before any child webview exists.
        #[cfg(target_os = "linux")]
        {
            builder = builder.setup(|app| {
                if let Some(wallet) = tauri::Manager::get_webview(app.handle(), "main") {
                    let _ = stage::raise(&wallet);
                    let _ = camera::allow(&wallet);
                }

                Ok(())
            });
        }
    }

    // iOS has no other command, so its handler is this one alone; one set on desktop above would be replaced by a second.
    #[cfg(target_os = "ios")]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            keychain::biometric_seal,
            keychain::biometric_open,
            keychain::biometric_forget
        ]);
    }

    #[cfg(any(target_os = "android", target_os = "ios", target_os = "macos"))]
    {
        builder = builder.plugin(tauri_plugin_biometric::init());
    }

    builder = builder.plugin(tauri_plugin_deep_link::init());

    builder = builder.plugin(tauri_plugin_opener::init());

    builder = builder.plugin(tauri_plugin_os::init());

    builder = builder.plugin(tauri_plugin_store::Builder::new().build());

    builder = builder.plugin(tauri_plugin_http::init());

    builder = builder.plugin(tauri_plugin_notification::init());

    builder
        .run(tauri::generate_context!())
        .expect("Application Failed");
}
