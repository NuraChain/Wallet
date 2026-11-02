use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use discord_rich_presence::activity::{Activity, Assets, Button, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::Deserialize;
use tauri::Manager;

/// How long to wait before dialling Discord again once it is closed or has gone away.
const RETRY: Duration = Duration::from_secs(5);

/// Discord takes five activity updates in twenty seconds, so updates closer together than this are folded into the last.
const GAP: Duration = Duration::from_secs(4);

/// The activity is sent again this often: a broken pipe only shows on a write, and this is how a restarted Discord is found.
const KEEP: Duration = Duration::from_secs(20);

/// How long the exit waits for the presence to be cleared; Discord drops it anyway once the pipe closes.
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

struct Link {
    client: DiscordIpcClient,
    app_id: String,
    shown: Option<PresenceActivity>,
    at: Instant,
}

fn build<'a>(activity: &'a PresenceActivity, started: i64) -> Activity<'a> {
    let assets = Assets::new()
        .large_image(activity.large_image.as_str())
        .large_text(activity.large_text.as_str());

    let buttons = activity
        .buttons
        .iter()
        .take(2)
        .map(|button| Button::new(button.label.as_str(), button.url.as_str()))
        .collect();

    let built = Activity::new()
        .assets(assets)
        .timestamps(Timestamps::new().start(started))
        .buttons(buttons);

    let built = match &activity.state {
        Some(state) => built.state(state.as_str()),
        None => built,
    };

    match &activity.details {
        Some(details) => built.details(details.as_str()),
        None => built,
    }
}

fn send(link: &mut Link, activity: &PresenceActivity, started: i64) -> bool {
    if link.client.set_activity(build(activity, started)).is_err() {
        return false;
    }

    // Discord answers every command; left unread, the answers would pile up in the pipe.
    matches!(link.client.recv(), Ok((1, _)))
}

// Closing on Windows leaves the pipe's handle open, so the client is dropped as well.
fn hang_up(mut link: Link) {
    let _ = link.client.clear_activity();
    let _ = link.client.close();
}

fn connect(app_id: &str) -> Option<DiscordIpcClient> {
    let mut client = DiscordIpcClient::new(app_id);

    client.connect().ok().map(|()| client)
}

/// Owns the one connection to Discord. Its IO blocks, so it lives on a thread of its own rather than on Tauri's runtime.
fn run(receiver: &Receiver<Message>, started: i64, first: PresenceActivity) {
    let mut wanted = first;
    let mut link: Option<Link> = None;
    let mut retry = Instant::now();

    loop {
        let due = match &link {
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

        if link.as_ref().is_some_and(|open| open.app_id != activity.app_id) {
            if let Some(open) = link.take() {
                hang_up(open);
            }
        }

        if link.is_none() {
            let Some(client) = connect(&activity.app_id) else {
                retry = Instant::now() + RETRY;

                continue;
            };

            link = Some(Link { client, app_id: activity.app_id.clone(), shown: None, at: Instant::now() });
        }

        if let Some(open) = link.as_mut() {
            if send(open, activity, started) {
                open.shown = Some(activity.clone());
                open.at = Instant::now();
            } else {
                // Discord has gone; dial again shortly and show the activity afresh.
                link = None;
                retry = Instant::now() + RETRY;
            }
        }
    }

    if let Some(open) = link.take() {
        hang_up(open);
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
