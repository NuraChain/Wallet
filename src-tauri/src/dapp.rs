//! The desktop half of the in-app provider.
//!
//! A page in the browser tab runs in a child webview of its own, so it cannot be spoken to from the
//! frontend directly — everything between a dApp and the wallet passes through here.
//!
//! Three things live in this file and only the first is reachable from a page:
//!
//! * `dapp_request` is what the injected script calls. It stamps the call with the label and origin
//!   of the webview it actually arrived from, hands it to the wallet, and holds the page's promise
//!   open until the wallet answers.
//! * `dapp_respond` and `dapp_emit` are the wallet talking back, and are refused to anything that is
//!   not the main webview.
//! * `browser_open` creates a page's webview in the first place, which has to happen in Rust because
//!   `initialization_script` — the only injection point that reliably runs before a page's own
//!   scripts — is not exposed by the JavaScript webview API.
//!
//! Android needs none of this: there the browser is a real `android.webkit.WebView` driven from
//! Kotlin, and `BrowserBridge.kt` carries the same three responsibilities.
//!
//! **The origin is established here and nowhere else.** A page is free to lie about who it is in
//! anything it sends, so nothing it sends is believed: `webview.url()` is what the wallet is told,
//! and every permission decision is made against that.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, Webview};

/// The label every browser page's webview starts with, as `frameLabel` in `core/browser.ts` mints it.
///
/// It is the boundary check for all four commands. A page may only reach a command from a webview
/// named this way, and the wallet may only aim `dapp_emit` and `browser_open` at one — so neither
/// side can be talked into addressing the wallet's own window.
const BROWSER_PREFIX: &str = "nura-browser-";

/// The label of the wallet's own webview, which is the only caller allowed to answer or to broadcast.
const WALLET_LABEL: &str = "main";

/// How long a page's call is held open before it is abandoned.
///
/// A request can legitimately take minutes — a signing prompt waits for a person, who may well put
/// the phone down — so the bound is generous. It exists for the case where nothing is going to answer
/// at all: the wallet locked, the dashboard unmounted and the listener went with it. Without it those
/// calls would hold a task and a channel for the life of the process, and the page would show a
/// spinner for just as long.
const REPLY_TIMEOUT: Duration = Duration::from_secs(600);

/// Everything a page has asked that the wallet has not yet answered.
///
/// Keyed by a ticket minted here rather than by the id the page generated, which is deliberate: two
/// tabs are two separate pages and nothing stops them choosing the same id, so a map keyed on their
/// ids would let one tab's answer settle another tab's request.
#[derive(Default)]
pub struct DappState {
    pending: Mutex<HashMap<u64, tokio::sync::oneshot::Sender<String>>>,
    counter: AtomicU64,
}

/// One call on its way to the wallet.
///
/// `payload` stays a string all the way across. Nothing in Rust needs to look inside it, and parsing
/// it here would mean this file had opinions about a shape that is defined in TypeScript on one side
/// and read in TypeScript on the other.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DappRequest {
    ticket: u64,
    label: String,
    origin: String,
    payload: String,
}

/// Whether a label names one of the browser's page webviews.
fn is_page(label: &str) -> bool {
    label.starts_with(BROWSER_PREFIX)
}

/// Answers a call from a page, once the wallet has decided what the answer is.
///
/// The page's promise is this command's return value, which is why it is `async`: the task parks on
/// the channel while the wallet thinks — and, for anything that needs approval, while the user does.
#[tauri::command]
pub async fn dapp_request<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    state: State<'_, DappState>,
    payload: String,
) -> Result<String, String> {
    let label = webview.label().to_string();

    if !is_page(&label) {
        return Err("this webview has no wallet provider".into());
    }

    // The one fact a page cannot supply about itself. Everything downstream — whether the site is
    // connected, which dialog is shown, whose grant is being spent — is decided against this.
    //
    // The origin and not the URL. A grant belongs to a site, so `/swap` and `/pool` on one host have
    // to arrive as the same string or a user who connected on one page would be asked again on the
    // next. `ascii_serialization` also drops a default port, which is what makes this match the
    // spelling JavaScript's `new URL(href).origin` produces on the Android side.
    //
    // Sending the origin rather than the full address is deliberate in itself: the path of every page
    // a user opens is not something the wallet needs, so it never leaves the native side.
    let origin = webview
        .url()
        .map_err(|cause| cause.to_string())?
        .origin()
        .ascii_serialization();

    let ticket = state.counter.fetch_add(1, Ordering::Relaxed);

    let (sender, receiver) = tokio::sync::oneshot::channel::<String>();

    {
        let mut pending = state
            .pending
            .lock()
            .map_err(|_| "the provider queue is poisoned".to_string())?;

        pending.insert(ticket, sender);
    }

    let outgoing = DappRequest {
        ticket,
        label,
        origin,
        payload,
    };

    if let Err(cause) = app.emit_to(WALLET_LABEL, "nura://dapp-request", outgoing) {
        if let Ok(mut pending) = state.pending.lock() {
            pending.remove(&ticket);
        }

        return Err(cause.to_string());
    }

    match tokio::time::timeout(REPLY_TIMEOUT, receiver).await {
        Ok(Ok(reply)) => Ok(reply),

        // Either the wallet never answered or the sender was dropped with it. The entry is cleared
        // in both cases, since nothing is going to come for it now.
        _ => {
            if let Ok(mut pending) = state.pending.lock() {
                pending.remove(&ticket);
            }

            Err("the wallet did not answer".into())
        }
    }
}

/// Hands one answer back to the call waiting on it.
///
/// A ticket with nothing waiting is not an error: the page may have navigated away or its tab may
/// have closed while the wallet was deciding, and the request went with it.
#[tauri::command]
pub fn dapp_respond<R: Runtime>(
    webview: Webview<R>,
    state: State<'_, DappState>,
    ticket: u64,
    payload: String,
) -> Result<(), String> {
    if webview.label() != WALLET_LABEL {
        return Err("only the wallet may answer a provider call".into());
    }

    let waiting = state
        .pending
        .lock()
        .map_err(|_| "the provider queue is poisoned".to_string())?
        .remove(&ticket);

    if let Some(sender) = waiting {
        let _ = sender.send(payload);
    }

    Ok(())
}

/// Pushes an EIP-1193 event into one page.
///
/// The payload is embedded with `serde_json`, which is what makes this safe to build by formatting:
/// it emits a complete JavaScript string literal with every quote, backslash and line terminator
/// already escaped, so a page cannot arrange for wallet state to be spliced back at it as code.
#[tauri::command]
pub fn dapp_emit<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    label: String,
    payload: String,
) -> Result<(), String> {
    if webview.label() != WALLET_LABEL {
        return Err("only the wallet may emit a provider event".into());
    }

    if !is_page(&label) {
        return Err("that webview is not a browser page".into());
    }

    let Some(target) = app.get_webview(&label) else {
        return Ok(());
    };

    let literal = serde_json::to_string(&payload).map_err(|cause| cause.to_string())?;

    target
        .eval(format!(
            "window.__nuraWalletEvent && window.__nuraWalletEvent({literal})"
        ))
        .map_err(|cause| cause.to_string())
}

/// Creates the webview one browser tab paints its page into.
///
/// This exists for `initialization_script` alone. Everything else about a page's webview — where it
/// sits, whether it is shown, when it is torn down — is still driven from `layout/webview.tsx`
/// through the JavaScript API, because that is where the layout it has to follow lives. But the
/// JavaScript `WebviewOptions` has no way to inject a script, and no other injection point runs
/// early enough: a script evaluated once a page has started loading has already lost the race
/// against the page's own scripts, and a dApp that read `window.ethereum` before it landed would
/// decide no wallet was present and never look again.
///
/// `async` on purpose. Creating a webview blocks on the main thread, and Tauri's own documentation
/// warns that doing that from a synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn browser_open<R: Runtime>(
    app: AppHandle<R>,
    webview: Webview<R>,
    label: String,
    url: String,
    user_agent: String,
    script: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if webview.label() != WALLET_LABEL {
        return Err("only the wallet may open a browser page".into());
    }

    if !is_page(&label) {
        return Err("that label is not a browser page".into());
    }

    let target = tauri::Url::parse(&url).map_err(|cause| cause.to_string())?;

    // The same rule the Android side enforces in `shouldOverrideUrlLoading`: only the two plain web
    // schemes are ever loaded, so a crafted address cannot reach a local file or hand the page off
    // to something else on the machine.
    if target.scheme() != "http" && target.scheme() != "https" {
        return Err("only http and https pages can be opened".into());
    }

    let window = app
        .get_window(WALLET_LABEL)
        .ok_or_else(|| "the wallet window is gone".to_string())?;

    let builder = tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(target))
        .user_agent(user_agent.as_str())
        .initialization_script(script.as_str())
        .focused(false);

    window
        .add_child(
            builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map(|_| ())
        .map_err(|cause| cause.to_string())
}
