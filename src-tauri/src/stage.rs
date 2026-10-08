//! Where a child webview sits on Linux.
//!
//! Tauri hands every webview of a window - the wallet's, and each child after it - to the one
//! vertical box the window was built with, so they stack as rows sharing its height. wry only
//! honours a position or a size for a webview held by a `gtk::Fixed`, which that box is not, so
//! nothing asked of a child through Tauri moves it and nothing read back says where it is.
//!
//! The window is given a `gtk::Overlay` in place of the box: the wallet underneath, and over it
//! one `gtk::Fixed` for the browser's tabs and another for the floating mouse, each letting the
//! pointer through wherever it holds nothing. An overlay keeps its layers above its own child and
//! in the order they were added, so the mouse stays over every tab without being raised.
//!
//! The box stays, hidden, as the place Tauri goes on leaving new webviews, and each is moved out
//! of it the first time it is placed. A menu bar would be left in there too and never seen, which
//! is why a window that has one keeps the layout it was given.

use gtk::prelude::*;
use tauri::{Runtime, Webview};

const TABS: &str = "nura-tabs";

const MOUSE: &str = "nura-mouse";

fn build(wallet: &gtk::Widget) {
    let Some(lot) = wallet
        .parent()
        .and_then(|parent| parent.downcast::<gtk::Box>().ok())
    else {
        return;
    };

    let Some(window) = lot
        .parent()
        .and_then(|parent| parent.downcast::<gtk::Container>().ok())
    else {
        return;
    };

    if lot.children().len() != 1 {
        return;
    }

    let overlay = gtk::Overlay::new();

    lot.remove(wallet);
    window.remove(&lot);

    overlay.add(wallet);

    // Showing the window shows everything in it, which would bring back every tab the wallet had
    // hidden. A layer is shown once, here, and left out of that from then on.
    for name in [TABS, MOUSE] {
        let fixed = gtk::Fixed::new();

        fixed.set_widget_name(name);
        fixed.set_no_show_all(true);
        fixed.show();

        overlay.add_overlay(&fixed);
        overlay.set_overlay_pass_through(&fixed, true);
    }

    lot.set_no_show_all(true);
    lot.hide();

    overlay.add_overlay(&lot);

    window.add(&overlay);

    overlay.show();

    // Taking the wallet out of the box took the keyboard from it.
    wallet.grab_focus();
}

/// The layer a webview is placed on, moving it there from the box Tauri left it in.
fn layer(widget: &gtk::Widget, name: &str) -> Option<gtk::Fixed> {
    let lot = match widget.parent()?.downcast::<gtk::Fixed>() {
        Ok(fixed) => return Some(fixed),

        Err(parent) => parent.downcast::<gtk::Box>().ok()?,
    };

    let overlay = lot.parent()?.downcast::<gtk::Overlay>().ok()?;

    let fixed = overlay
        .children()
        .into_iter()
        .find(|child| child.widget_name() == name)?
        .downcast::<gtk::Fixed>()
        .ok()?;

    lot.remove(widget);

    fixed.put(widget, 0, 0);

    Some(fixed)
}

/// Rebuilds the wallet's window around the overlay. Called once, before any child exists.
pub fn raise<R: Runtime>(wallet: &Webview<R>) -> tauri::Result<()> {
    wallet.with_webview(|platform| {
        build(&platform.inner().upcast::<gtk::Widget>());
    })
}

/// Puts a child webview at a place in the wallet's own coordinates, on the mouse's layer when it
/// is `floating` and on the tabs' otherwise.
pub fn place<R: Runtime>(
    view: &Webview<R>,
    floating: bool,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> tauri::Result<()> {
    let name = if floating { MOUSE } else { TABS };

    view.with_webview(move |platform| {
        let widget = platform.inner().upcast::<gtk::Widget>();

        let Some(fixed) = layer(&widget, name) else {
            return;
        };

        widget.set_size_request(width.round() as i32, height.round() as i32);

        fixed.move_(&widget, x.round() as i32, y.round() as i32);
    })
}

/// Where a placed webview sits, in the same coordinates `place` took. `None` for one that was
/// never placed, or that went away before it could be asked.
pub async fn position<R: Runtime>(view: &Webview<R>) -> Option<(i32, i32)> {
    let (sender, receiver) = tokio::sync::oneshot::channel();

    view.with_webview(move |platform| {
        let widget = platform.inner().upcast::<gtk::Widget>();

        let at = widget
            .parent()
            .and_then(|parent| parent.downcast::<gtk::Fixed>().ok())
            .map(|fixed| (fixed.child_x(&widget), fixed.child_y(&widget)));

        let _ = sender.send(at);
    })
    .ok()?;

    receiver.await.ok().flatten()
}
