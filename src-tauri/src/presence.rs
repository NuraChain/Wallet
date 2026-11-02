use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::Manager;

// The desktop reaches the Discord app over its local IPC pipe; a phone has none, and Discord's Social SDK reaches the app instead.
#[cfg(desktop)]
mod ipc;

#[cfg(desktop)]
use ipc::Link;

#[cfg(target_os = "android")]
mod sdk;

#[cfg(target_os = "android")]
use sdk::Link;

/// Discord takes five activity updates in twenty seconds, so updates closer together than this are folded into the last.
const GAP: Duration = Duration::from_secs(4);

/// The activity is sent again this often: a broken link only shows on a write, and this is how a restarted Discord is found.
const KEEP: Duration = Duration::from_secs(20);

/// How long the exit waits for the presence to be cleared; Discord drops it anyway once the link closes.
const FAREWELL: Duration = Duration::from_secs(1);

#[derive(Clone, Deserialize, PartialEq)]
pub struct PresenceButton {
    label: String,
    url: String,
}

/// Everything shown comes from the wallet's own page: the state line is one of its fixed descriptions and the details line at most a
/// website's host name and a game from a fixed list, never wallet data.
#[derive(Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PresenceActivity {
    app_id: String,
    state: Option<String>,
    details: Option<String>,
    large_image: String,
    large_text: String,
    buttons: Vec<PresenceButton>,
}

enum Message {
    Show(PresenceActivity),
    Quit,
}

struct Worker {
    sender: Sender<Message>,
    done: Receiver<()>,
}

pub struct PresenceState {
    started: i64,
    worker: Mutex<Option<Worker>>,
}

impl Default for PresenceState {
    fn default() -> Self {
        let started = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs() as i64);

        Self { started, worker: Mutex::new(None) }
    }
}

struct Open {
    link: Link,
    app_id: String,
    shown: Option<PresenceActivity>,
    at: Instant,
}

/// Owns the one link to Discord. Its IO blocks, so it lives on a thread of its own rather than on Tauri's runtime.
fn run(receiver: &Receiver<Message>, started: i64, first: PresenceActivity) {
    let mut wanted = first;
    let mut open: Option<Open> = None;
    let mut retry = Instant::now();
    let mut failures = 0;

    loop {
        let due = match &open {
            None => retry,
            Some(open) if open.shown.as_ref() == Some(&wanted) => open.at + KEEP,
            Some(open) if open.shown.is_none() => open.at,
            Some(open) => open.at + GAP,
        };

        // Messages already queued come back before the deadline does, so a burst of changes is acted on once.
        match receiver.recv_timeout(due.saturating_duration_since(Instant::now())) {
            Ok(Message::Show(next)) => {
                wanted = next;

                continue;
            }

            Ok(Message::Quit) | Err(RecvTimeoutError::Disconnected) => break,

            Err(RecvTimeoutError::Timeout) => {}
        }

        let activity = &wanted;

        if open.as_ref().is_some_and(|current| current.app_id != activity.app_id) {
            if let Some(current) = open.take() {
                current.link.hang_up();
            }
        }

        if open.is_none() {
            let Some(link) = Link::connect(&activity.app_id) else {
                failures += 1;
                retry = Instant::now() + Link::retry(failures);

                continue;
            };

            open = Some(Open { link, app_id: activity.app_id.clone(), shown: None, at: Instant::now() });
        }

        if let Some(current) = open.as_mut() {
            if current.link.send(activity, started) {
                current.shown = Some(activity.clone());
                current.at = Instant::now();
                failures = 0;
            } else {
                // Discord has gone, or was never there; dial again later and show the activity afresh.
                open = None;
                failures += 1;
                retry = Instant::now() + Link::retry(failures);
            }
        }
    }

    if let Some(current) = open.take() {
        current.link.hang_up();
    }
}

/// The first call starts the one thread that talks to Discord; later ones only hand it the new activity.
#[tauri::command]
pub fn presence_set(state: tauri::State<'_, PresenceState>, activity: PresenceActivity) -> Result<(), String> {
    let mut worker = state.worker.lock().map_err(|_| "presence unavailable")?;

    if let Some(running) = worker.as_ref() {
        return running.sender.send(Message::Show(activity)).map_err(|_| "presence unavailable".into());
    }

    let (sender, receiver) = mpsc::channel();
    let (finished, done) = mpsc::channel();
    let started = state.started;

    thread::Builder::new()
        .name("presence".into())
        .spawn(move || {
            run(&receiver, started, activity);

            let _ = finished.send(());
        })
        .map_err(|_| "presence unavailable")?;

    *worker = Some(Worker { sender, done });

    Ok(())
}

pub fn close<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Some(state) = app.try_state::<PresenceState>() else {
        return;
    };

    let Some(running) = state.worker.lock().ok().and_then(|mut worker| worker.take()) else {
        return;
    };

    if running.sender.send(Message::Quit).is_ok() {
        let _ = running.done.recv_timeout(FAREWELL);
    }
}
