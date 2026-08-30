fn main() {
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
