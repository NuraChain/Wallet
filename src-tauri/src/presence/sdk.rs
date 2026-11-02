//! Rich Presence through Discord's Social SDK, which reaches the Discord app on the phone without the user signing in. A build carries the
//! SDK only when its AAR was supplied, so its library is opened at run time (`MainActivity` has loaded it by then); without it there is
//! never a link and the wallet carries on.

use std::ffi::c_void;
use std::ptr;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use libloading::Library;

use super::PresenceActivity;

/// How long an update waits for Discord's answer before the link is taken for gone.
const ANSWER: Duration = Duration::from_secs(5);

/// The SDK answers only from inside `Discord_RunCallbacks`, so while an answer is awaited it is given that chance this often.
const PUMP: Duration = Duration::from_millis(50);

/// The first wait before Discord is tried again, doubled after each miss up to `RETRY_MOST`.
const RETRY_FIRST: Duration = Duration::from_secs(5);

/// Most phones have no Discord app, and every try there holds the thread for up to `ANSWER`, so the waits grow to this.
const RETRY_MOST: Duration = Duration::from_secs(300);

/// `Discord_ActivityTypes_Playing`.
const PLAYING: i32 = 0;

/// Every SDK object is a pointer the SDK fills in its `_Init` and frees in its `_Drop`.
#[repr(C)]
struct Handle {
    opaque: *mut c_void,
}

impl Handle {
    const fn new() -> Self {
        Self { opaque: ptr::null_mut() }
    }
}

/// `Discord_String`. Setters copy what it points at, so it may borrow a Rust string for the length of the call.
#[repr(C)]
struct Text {
    ptr: *mut u8,
    size: usize,
}

fn text(value: &str) -> Text {
    Text { ptr: value.as_ptr().cast_mut(), size: value.len() }
}

type Answered = unsafe extern "C" fn(result: *mut Handle, data: *mut c_void);

type Free = unsafe extern "C" fn(data: *mut c_void);

type Init = unsafe extern "C" fn(*mut Handle);

type SetText = unsafe extern "C" fn(*mut Handle, *mut Text);

type SetTextValue = unsafe extern "C" fn(*mut Handle, Text);

struct Sdk {
    _library: Library,
    run_callbacks: unsafe extern "C" fn(),
    client_init: Init,
    client_drop: Init,
    client_set_application_id: unsafe extern "C" fn(*mut Handle, u64),
    client_update_rich_presence: unsafe extern "C" fn(*mut Handle, *mut Handle, Answered, Free, *mut c_void),
    client_clear_rich_presence: Init,
    result_successful: unsafe extern "C" fn(*mut Handle) -> bool,
    result_drop: Init,
    activity_init: Init,
    activity_drop: Init,
    activity_set_type: unsafe extern "C" fn(*mut Handle, i32),
    activity_set_state: SetText,
    activity_set_details: SetText,
    activity_set_assets: unsafe extern "C" fn(*mut Handle, *mut Handle),
    activity_set_timestamps: unsafe extern "C" fn(*mut Handle, *mut Handle),
    activity_add_button: unsafe extern "C" fn(*mut Handle, *const Handle),
    assets_init: Init,
    assets_drop: Init,
    assets_set_large_image: SetText,
    assets_set_large_text: SetText,
    timestamps_init: Init,
    timestamps_drop: Init,
    timestamps_set_start: unsafe extern "C" fn(*mut Handle, u64),
    button_init: Init,
    button_drop: Init,
    button_set_label: SetTextValue,
    button_set_url: SetTextValue,
}

impl Sdk {
    /// # Safety
    /// Each symbol is given the type `cdiscord.h` declares for it.
    unsafe fn open() -> Result<Self, libloading::Error> {
        let library = Library::new("libdiscord_partner_sdk.so")?;

        macro_rules! symbol {
            ($name:literal) => {
                pick(&library, concat!($name, "\0").as_bytes())?
            };
        }

        Ok(Self {
            run_callbacks: symbol!("Discord_RunCallbacks"),
            client_init: symbol!("Discord_Client_Init"),
            client_drop: symbol!("Discord_Client_Drop"),
            client_set_application_id: symbol!("Discord_Client_SetApplicationId"),
            client_update_rich_presence: symbol!("Discord_Client_UpdateRichPresence"),
            client_clear_rich_presence: symbol!("Discord_Client_ClearRichPresence"),
            result_successful: symbol!("Discord_ClientResult_Successful"),
            result_drop: symbol!("Discord_ClientResult_Drop"),
            activity_init: symbol!("Discord_Activity_Init"),
            activity_drop: symbol!("Discord_Activity_Drop"),
            activity_set_type: symbol!("Discord_Activity_SetType"),
            activity_set_state: symbol!("Discord_Activity_SetState"),
            activity_set_details: symbol!("Discord_Activity_SetDetails"),
            activity_set_assets: symbol!("Discord_Activity_SetAssets"),
            activity_set_timestamps: symbol!("Discord_Activity_SetTimestamps"),
            activity_add_button: symbol!("Discord_Activity_AddButton"),
            assets_init: symbol!("Discord_ActivityAssets_Init"),
            assets_drop: symbol!("Discord_ActivityAssets_Drop"),
            assets_set_large_image: symbol!("Discord_ActivityAssets_SetLargeImage"),
            assets_set_large_text: symbol!("Discord_ActivityAssets_SetLargeText"),
            timestamps_init: symbol!("Discord_ActivityTimestamps_Init"),
            timestamps_drop: symbol!("Discord_ActivityTimestamps_Drop"),
            timestamps_set_start: symbol!("Discord_ActivityTimestamps_SetStart"),
            button_init: symbol!("Discord_ActivityButton_Init"),
            button_drop: symbol!("Discord_ActivityButton_Drop"),
            button_set_label: symbol!("Discord_ActivityButton_SetLabel"),
            button_set_url: symbol!("Discord_ActivityButton_SetUrl"),
            _library: library,
        })
    }
}

/// # Safety
/// `T` is the function type the symbol was declared with.
unsafe fn pick<T: Copy>(library: &Library, name: &[u8]) -> Result<T, libloading::Error> {
    library.get::<T>(name).map(|symbol| *symbol)
}

// Opened once and kept for the life of the process, so the functions taken from it stay valid.
fn sdk() -> Option<&'static Sdk> {
    static SDK: OnceLock<Option<Sdk>> = OnceLock::new();

    SDK.get_or_init(|| unsafe { Sdk::open() }.ok()).as_ref()
}

/// Called from inside `Discord_RunCallbacks` on the presence thread. The result is the callback's to free.
unsafe extern "C" fn answered(result: *mut Handle, data: *mut c_void) {
    let Some(sdk) = sdk() else {
        return;
    };

    let successful = (sdk.result_successful)(result);

    (sdk.result_drop)(result);

    let _ = (*data.cast::<Sender<bool>>()).send(successful);
}

/// The SDK frees the callback's data itself once the callback is done with, or will never come.
unsafe extern "C" fn release(data: *mut c_void) {
    drop(Box::from_raw(data.cast::<Sender<bool>>()));
}

pub struct Link {
    sdk: &'static Sdk,
    client: Handle,
}

impl Link {
    pub fn retry(failures: u32) -> Duration {
        RETRY_FIRST
            .saturating_mul(1 << failures.saturating_sub(1).min(6))
            .min(RETRY_MOST)
    }

    /// No sign-in: the SDK reaches the installed Discord app directly. Whether it is there shows only on the first send.
    pub fn connect(app_id: &str) -> Option<Self> {
        let sdk = sdk()?;
        let id = app_id.parse::<u64>().ok()?;

        let mut client = Handle::new();

        unsafe {
            (sdk.client_init)(&mut client);
            (sdk.client_set_application_id)(&mut client, id);
        }

        Some(Self { sdk, client })
    }

    pub fn send(&mut self, activity: &PresenceActivity, started: i64) -> bool {
        let sdk = self.sdk;
        let (sender, answer) = mpsc::channel::<bool>();

        unsafe {
            let mut built = Handle::new();

            (sdk.activity_init)(&mut built);
            (sdk.activity_set_type)(&mut built, PLAYING);

            if let Some(state) = &activity.state {
                (sdk.activity_set_state)(&mut built, &mut text(state));
            }

            if let Some(details) = &activity.details {
                (sdk.activity_set_details)(&mut built, &mut text(details));
            }

            let mut assets = Handle::new();

            (sdk.assets_init)(&mut assets);
            (sdk.assets_set_large_image)(&mut assets, &mut text(&activity.large_image));
            (sdk.assets_set_large_text)(&mut assets, &mut text(&activity.large_text));
            (sdk.activity_set_assets)(&mut built, &mut assets);
            (sdk.assets_drop)(&mut assets);

            let mut timestamps = Handle::new();

            (sdk.timestamps_init)(&mut timestamps);
            (sdk.timestamps_set_start)(&mut timestamps, u64::try_from(started).unwrap_or(0));
            (sdk.activity_set_timestamps)(&mut built, &mut timestamps);
            (sdk.timestamps_drop)(&mut timestamps);

            for item in activity.buttons.iter().take(2) {
                let mut button = Handle::new();

                (sdk.button_init)(&mut button);
                (sdk.button_set_label)(&mut button, text(&item.label));
                (sdk.button_set_url)(&mut button, text(&item.url));
                (sdk.activity_add_button)(&mut built, &button);
                (sdk.button_drop)(&mut button);
            }

            let data = Box::into_raw(Box::new(sender)).cast::<c_void>();

            (sdk.client_update_rich_presence)(&mut self.client, &mut built, answered, release, data);
            (sdk.activity_drop)(&mut built);
        }

        let deadline = Instant::now() + ANSWER;

        while Instant::now() < deadline {
            unsafe { (sdk.run_callbacks)() };

            match answer.recv_timeout(PUMP) {
                Ok(successful) => return successful,
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return false,
            }
        }

        false
    }

    pub fn hang_up(mut self) {
        unsafe { (self.sdk.client_clear_rich_presence)(&mut self.client) };
    }
}

impl Drop for Link {
    fn drop(&mut self) {
        unsafe { (self.sdk.client_drop)(&mut self.client) };
    }
}
