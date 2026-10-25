//! The wallet password, held for biometric unlock in the Keychain behind Face ID or Touch ID.
//!
//! The item is bound to this device and to the biometrics enrolled when it was written: a new finger or face, or a passcode
//! taken off, and the system drops it, so the wallet falls back to the typed password. Reading it is what raises the prompt,
//! and the system answers it; nothing here can read the item without one.
//!
//! Errors reach the page as one word: `cancel` (asked and turned down; keep it), `gone` (nothing left to read; turn it off),
//! `unavailable` (this build may not hold such an item: an unsigned macOS build has no keychain entitlement) or `failed`.

use security_framework::access_control::{ProtectionMode, SecAccessControl};
use security_framework::base::Error;
use security_framework::passwords::{
    delete_generic_password_options, generic_password, set_generic_password_options, AccessControlOptions, PasswordOptions,
};

const SERVICE: &str = "net.nurachain.wallet.biometric";
const ACCOUNT: &str = "password";

const ITEM_NOT_FOUND: i32 = -25300;
const USER_CANCELED: i32 = -128;
const AUTH_FAILED: i32 = -25293;
const INTERACTION_NOT_ALLOWED: i32 = -25308;
const MISSING_ENTITLEMENT: i32 = -34018;

fn describe(error: Error) -> String {
    match error.code() {
        USER_CANCELED | AUTH_FAILED | INTERACTION_NOT_ALLOWED => "cancel",
        ITEM_NOT_FOUND => "gone",
        MISSING_ENTITLEMENT => "unavailable",
        _ => "failed",
    }
    .to_string()
}

// The data protection keychain on macOS too: the file-based one has no biometric access control.
fn item() -> PasswordOptions {
    let mut options = PasswordOptions::new_generic_password(SERVICE, ACCOUNT);

    options.use_protected_keychain();

    options
}

fn forget() -> Result<(), String> {
    match delete_generic_password_options(item()) {
        Err(error) if error.code() != ITEM_NOT_FOUND => Err(describe(error)),
        _ => Ok(()),
    }
}

fn seal(secret: &str) -> Result<(), String> {
    // Written fresh rather than updated: an update would have to read the old item, and so ask for a face.
    forget()?;

    let access = SecAccessControl::create_with_protection(
        Some(ProtectionMode::AccessibleWhenPasscodeSetThisDeviceOnly),
        AccessControlOptions::BIOMETRY_CURRENT_SET.bits(),
    )
    .map_err(describe)?;

    let mut options = item();

    options.set_access_control(access);

    set_generic_password_options(secret.as_bytes(), options).map_err(describe)
}

fn open() -> Result<String, String> {
    let bytes = generic_password(item()).map_err(describe)?;

    String::from_utf8(bytes).map_err(|_| "gone".to_string())
}

// Off the main thread: the system's prompt is drawn there, and a command run on it would wait on itself.
async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|_| "failed".to_string())?
}

#[tauri::command]
pub async fn biometric_seal(secret: String) -> Result<(), String> {
    blocking(move || seal(&secret)).await
}

#[tauri::command]
pub async fn biometric_open() -> Result<String, String> {
    blocking(open).await
}

#[tauri::command]
pub async fn biometric_forget() -> Result<(), String> {
    blocking(forget).await
}
