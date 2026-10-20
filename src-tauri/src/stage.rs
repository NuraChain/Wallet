//! wry ignores position and size outside a `gtk::Fixed`, so Tauri's `gtk::Box` is swapped for an
//! overlay of `gtk::Fixed` layers. A window with a menu bar keeps its box, or the bar is lost.

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

    // Showing the window would re-show every hidden tab, so each layer is shown once and opted out.
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

    // Taking the wallet out of the box took its keyboard focus.
    wallet.grab_focus();
}

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

pub fn raise<R: Runtime>(wallet: &Webview<R>) -> tauri::Result<()> {
    wallet.with_webview(|platform| {
        build(&platform.inner().upcast::<gtk::Widget>());
    })
}

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
