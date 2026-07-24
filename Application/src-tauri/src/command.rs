use argon2::{Algorithm, Argon2, Params, Version};

const APP_SALT: &[u8] = b"ApplicationSaltAt2026";

#[tauri::command]
pub fn password_hash(password: &str) -> String {
    let params = Params::new(32768, 2, 1, Some(32)).unwrap();

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut hash = [0u8; 32];

    argon2
        .hash_password_into(password.as_bytes(), APP_SALT, &mut hash)
        .unwrap();

    hash.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
pub fn password_verify(password: &str, expected_hash: &str) -> bool {
    password_hash(password) == expected_hash
}
