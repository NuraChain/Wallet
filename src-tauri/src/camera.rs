//! The wallet's own camera on Linux.
//!
//! WebKitGTK ships with capture switched off, and refuses a request for a device that nothing
//! answers. wry leaves both as they are. That is right for a page from the web, and it leaves the
//! wallet's recipient scanner with no camera to ask for.
//!
//! Both are put right for the wallet's webview and no other. A browser tab is a webview of its own
//! with settings of its own, so a visited page still finds no camera at all.

use gtk::prelude::*;
use tauri::{Runtime, Webview};
use webkit2gtk::{
    PermissionRequestExt, SettingsExt, UserMediaPermissionRequest, UserMediaPermissionRequestExt,
    WebViewExt,
};

/// Lets the wallet's page open the camera. Called once, on the webview the window was built with.
pub fn allow<R: Runtime>(wallet: &Webview<R>) -> tauri::Result<()> {
    wallet.with_webview(|platform| {
        let view = platform.inner();

        if let Some(settings) = WebViewExt::settings(&view) {
            settings.set_enable_media_stream(true);
        }

        view.connect_permission_request(|_, request| {
            // Anything else the page might ask for is left to whoever answered it before.
            let Some(media) = request.downcast_ref::<UserMediaPermissionRequest>() else {
                return false;
            };

            // The scanner asks for a picture and nothing with it. A request that wants the
            // microphone as well is not the scanner's, and one answer covers all of a request.
            if media.is_for_video_device() && !media.is_for_audio_device() {
                request.allow();
            } else {
                request.deny();
            }

            true
        });
    })
}
