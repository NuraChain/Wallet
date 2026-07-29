#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
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
    }

    builder = builder.plugin(tauri_plugin_os::init());

    builder = builder.plugin(tauri_plugin_store::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("Application Failed");
}
