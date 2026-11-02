use std::time::Duration;

use discord_rich_presence::activity::{Activity, Assets, Button, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};

use super::PresenceActivity;

pub struct Link {
    client: DiscordIpcClient,
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

impl Link {
    /// A pipe that is not there fails at once, so Discord is looked for again soon, however often it was missed.
    pub const fn retry(_failures: u32) -> Duration {
        Duration::from_secs(5)
    }

    pub fn connect(app_id: &str) -> Option<Self> {
        let mut client = DiscordIpcClient::new(app_id);

        client.connect().ok().map(|()| Self { client })
    }

    pub fn send(&mut self, activity: &PresenceActivity, started: i64) -> bool {
        if self.client.set_activity(build(activity, started)).is_err() {
            return false;
        }

        // Discord answers every command; left unread, the answers would pile up in the pipe.
        matches!(self.client.recv(), Ok((1, _)))
    }

    // Closing on Windows leaves the pipe's handle open, so the client is dropped as well.
    pub fn hang_up(mut self) {
        let _ = self.client.clear_activity();
        let _ = self.client.close();
    }
}
