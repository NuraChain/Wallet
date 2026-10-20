//! WebKitGTK ships with capture off and refuses unanswered requests. Enabled for the wallet's
//! webview only: a browser tab has its own settings, so a visited page still gets no camera.

use gtk::prelude::*;
use tauri::{Runtime, Webview};
use webkit2gtk::{
    PermissionRequestExt, SettingsExt, UserMediaPermissionRequest, UserMediaPermissionRequestExt,
    WebViewExt,
};

pub fn allow<R: Runtime>(wallet: &Webview<R>) -> tauri::Result<()> {
    wallet.with_webview(|platform| {
        let view = platform.inner();

        if let Some(settings) = WebViewExt::settings(&view) {
            settings.set_enable_media_stream(true);
        }

        view.connect_permission_request(|_, request| {
            let Some(media) = request.downcast_ref::<UserMediaPermissionRequest>() else {
                return false;
            };

            // Video only: a request that also wants the microphone is not the scanner's.
            if media.is_for_video_device() && !media.is_for_audio_device() {
                request.allow();
            } else {
                request.deny();
            }

            true
        });
    })
}
