fn main() {
    // The four provider commands are declared to the access-control list rather than left to the
    // default, and that is the whole point of naming them here.
    //
    // By default every command an app registers is callable by anything the app has loaded, and this
    // app loads arbitrary websites into the browser tab. Declaring them turns that around: a command
    // is then reachable only where a capability grants it, which is what lets `browser-capability`
    // hand a visited page `dapp_request` and nothing else, while `browser_open`, `dapp_respond` and
    // `dapp_emit` stay with the wallet's own window.
    //
    // Declared for every target even though `src/dapp.rs` is desktop-only. An entry for a command
    // that was not compiled in is inert — nothing on Android ever invokes one, because the browser
    // there is Kotlin's `BrowserBridge` and never touches Tauri IPC — whereas making the manifest
    // itself conditional would mean the generated schema differed by platform for no gain.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "browser_open",
                "dapp_request",
                "dapp_respond",
                "dapp_emit",
            ]),
        ),
    )
    .expect("Build Failed")
}
