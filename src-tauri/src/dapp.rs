
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, Webview};

const BROWSER_PREFIX: &str = "nura-browser-";

const WALLET_LABEL: &str = "main";

const REPLY_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Default)]
pub struct DappState {
    pending: Mutex<HashMap<u64, tokio::sync::oneshot::Sender<String>>>,
    counter: AtomicU64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DappRequest {
    ticket: u64,
    label: String,
    origin: String,
    payload: String,
}

/// A link the page tried to open that this webview cannot load itself — a `wc:` pairing, a wallet
/// scheme, an app link. The page's own navigation is cancelled and the wallet is offered the URL.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DappLink {
    label: String,
    url: String,
}

fn is_page_scheme(scheme: &str) -> bool {
    matches!(scheme, "http" | "https" | "about" | "blob" | "data" | "javascript")
}

fn is_page(label: &str) -> bool {
    label.starts_with(BROWSER_PREFIX)
}

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

        _ => {
            if let Ok(mut pending) = state.pending.lock() {
                pending.remove(&ticket);
            }

            Err("the wallet did not answer".into())
        }
    }
}

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

    if target.scheme() != "http" && target.scheme() != "https" {
        return Err("only http and https pages can be opened".into());
    }

    let window = app
        .get_window(WALLET_LABEL)
        .ok_or_else(|| "the wallet window is gone".to_string())?;

    let carrier = app.clone();
    let carried = label.clone();

    let builder = tauri::webview::WebviewBuilder::new(&label, tauri::WebviewUrl::External(target))
        .user_agent(user_agent.as_str())
        .initialization_script(script.as_str())
        .on_navigation(move |url| {
            if is_page_scheme(url.scheme()) {
                return true;
            }

            // Nothing in this webview can open a foreign scheme, and letting the navigation run
            // leaves the page on a dead end. The wallet is given the URL instead: a WalletConnect
            // pairing is one it knows what to do with, and the rest is dropped there.
            let _ = carrier.emit_to(
                WALLET_LABEL,
                "nura://dapp-link",
                DappLink {
                    label: carried.clone(),
                    url: url.to_string(),
                },
            );

            false
        })
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
