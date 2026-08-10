---
name: release
description: How Nura Wallet releases are cut — the version bump, the v* tag, and what the four CI jobs produce. Use when tagging a release, changing .github/workflows/release.yml, renaming release assets, or debugging a failed or short release build.
---

# Cutting a release

`package-lock.json` is committed and CI installs from it with `npm ci`. Releases are cut by pushing a `v*` tag: [.github/workflows/release.yml](../../../.github/workflows/release.yml) builds every platform and attaches the renamed installers to a draft release.

**The version lives in exactly one place — `src-tauri/Cargo.toml`.** Tauri takes the desktop and Android versions from it and Vite reads it at config time, so the interface shows the number it was built from. The workflow's first job compares that number against the tag and fails the run when they disagree, so the bump has to land as its own commit *before* the tag is pushed.

Twelve files, from four jobs:

- **windows** — `.exe` (NSIS), x64 only. Windows on ARM emulates x64, so a second toolchain would buy nothing. `tauri.windows.conf.json` restricts `targets` to `nsis`: the MSI it used to ship alongside was a second installer for the same machines, and dropping it at the staging step would still have paid for the WiX download and the extra bundling pass, so the target list is where it goes.
- **linux** — a matrix of two *natively* built architectures, x86_64 on `ubuntu-22.04` and aarch64 on `ubuntu-22.04-arm` (free for public repos), each bundling `.deb`, `.rpm` and `.AppImage`. That is the whole reachable set, not a shortlist: i386 has no `libwebkit2gtk` in Ubuntu's partial multiarch so it cannot link, and armhf has no runner — it would need either a cross sysroot for webkit or the emulated runner Tauri's docs suggest, which risks the six-hour job limit. The arch label differs per format on purpose (dpkg says `amd64`/`arm64`, rpm and AppImage say `x86_64`/`aarch64`).
- **android** — five APKs from **two** builds, because the shapes are mutually exclusive: plain `--apk` assembles the single `universal` flavour, and `--apk --split-per-abi` assembles the four single-ABI ones instead. Neither produces the other. The flavours come from `RustPlugin.kt` in the git-ignored `gen/android/buildSrc`, and their Gradle names (`arm64`, `arm`, `x86`, `x86_64`) are *not* the ABI names a phone reports — the collect step maps them to `arm64-v8a`/`armeabi-v7a`/`x86`/`x86_64` so a downloader can match the file to their device. The second build is cheap; it reuses the four Rust targets the first already compiled.
- **release** — needs all three, tag-only, draft.

## The staging scheme

Every job stages into `release-files/` under one `Nura-Wallet-<platform>-<arch>.<ext>` scheme rather than uploading from the bundle tree. The platform is spelled out because the arch alone does not identify a build — `x86_64` and `arm64` each name both a Linux package and an Android ABI — so the twelve assets only sort into three obvious groups once it is in the name.

The **version is deliberately not in the filename**, so a download link reads the same at every release; the cost is that a saved file is anonymous, and the `version` job's tag check is therefore the only thing keeping the number honest. That job publishes no output — it is purely a gate the three build jobs wait on.

Staging rather than uploading from the bundle tree has two reasons, both learned the hard way: `upload-artifact` roots its archive at the common ancestor of the search *paths*, so listing several bundle directories nests the files a level down and the release job's globs miss them; and Tauri names bundles after `productName`, which has a space in it that GitHub rewrites to a dot on the assets list. The staging directory must not be `dist` — that is Vite's output, and staging there attached `index.html` to a release.

The release job warns rather than fails when the asset count is not twelve, so a bundler that quietly produced nothing leaves the release short a download without failing the run — check the staging warnings in the build jobs when a download is missing.

## Android signing

A tagged Android build fails early unless `ANDROID_KEYSTORE` (+ password, alias, key password) is set, and fails late if Gradle produced an unsigned APK anyway — an unsigned APK cannot be installed, so shipping one wastes the tag.
