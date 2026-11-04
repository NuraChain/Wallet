# Nura Wallet — Self-Custody Crypto Wallet for Desktop, Mobile and Browser

**Nura Wallet** is an open-source, non-custodial Ethereum-compatible crypto wallet for managing digital assets and connecting to decentralised applications. It supports Nura Chain and familiar EVM wallet workflows across desktop, mobile and browser-extension builds.

Your recovery phrase is encrypted with **AES-GCM** before local storage, and the passphrase used to unlock it is protected with **Argon2id**. Private wallet material is designed to remain on the user's device.

## Features

- **Self-custody:** keep control of your recovery phrase and wallet keys.
- **Local encryption:** AES-GCM encryption for the stored recovery phrase and Argon2id passphrase hashing.
- **Token transfers:** send and receive native assets and ERC-20 tokens.
- **EVM networks:** switch networks and use standard Ethereum-compatible wallet flows.
- **Built-in dApp browser:** open decentralised applications from inside the wallet.
- **Multi-platform project:** desktop builds for Windows, macOS and Linux; mobile targets for Android and iOS; and browser-extension builds.
- **Accessible interface:** multilingual UI with Persian and other right-to-left language support.

## Download Nura Wallet

Download the latest published build from GitHub Releases. The links below always resolve to the latest release asset.

| Platform | Download |
| --- | --- |
| Windows x64 | [Installer][windows] |
| Linux x86_64 | [.deb][linux-deb-x64] · [.rpm][linux-rpm-x64] · [.AppImage][linux-appimage-x64] |
| Linux ARM64 | [.deb][linux-deb-arm64] · [.rpm][linux-rpm-arm64] · [.AppImage][linux-appimage-arm64] |
| Android | [Universal APK][android] · [ARM64][android-arm64] · [ARMv7][android-arm] · [x86][android-x86] · [x86_64][android-x64] |
| Chrome extension | [ZIP][chrome] |
| Edge extension | [ZIP][edge] |
| Firefox extension | [ZIP][firefox] |
| Safari extension | [ZIP][safari] |

For release notes, checksums and older versions, visit the [Nura Wallet releases page][releases]. Platform assets appear there as they are published.

## Build from source

Nura Wallet uses **Tauri 2, React, TypeScript, Vite and ethers.js**.

~~~bash
git clone https://github.com/NuraChain/Wallet.git
cd Wallet
npm install
npm run dev
~~~

Useful project scripts:

| Command | Purpose |
| --- | --- |
| npm run dev | Start the Vite development server |
| npm run desktop | Run the Tauri desktop application in development |
| npm run desktop-build | Build the desktop application |
| npm run android | Run the Android development build |
| npm run android-apk | Build an Android APK |
| npm run android-aab | Build an Android App Bundle |
| npm run extension | Build the browser extension |
| npm run build | Type-check and build the web application |
| npm test | Run the test suite |
| npm run lint | Run Oxlint |

Native Tauri targets require the relevant platform toolchains and SDKs. Consult the [Tauri documentation](https://v2.tauri.app/) for platform-specific prerequisites.

## Security

Nura Wallet is a self-custody wallet: users are responsible for protecting their recovery phrase and device. Review the source code and release notes before installing, and never share your recovery phrase or enter it into an untrusted website.

## Ecosystem

- [Nura Chain](https://nurachain.net) — EVM-compatible blockchain
- [Nura Chain Explorer](https://explorer.nurachain.net) — blocks, transactions and on-chain activity
- [Nura Wallet website](https://nurawallet.app)
- [Nura Chain GitHub organisation](https://github.com/NuraChain)

## License

Released under the [MIT License](license).

[releases]: https://github.com/NuraChain/Wallet/releases
[windows]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Windows-x64-setup.exe
[linux-deb-x64]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Linux-amd64.deb
[linux-rpm-x64]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Linux-x86_64.rpm
[linux-appimage-x64]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Linux-x86_64.AppImage
[linux-deb-arm64]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Linux-arm64.deb
[linux-rpm-arm64]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Linux-aarch64.rpm
[linux-appimage-arm64]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Linux-aarch64.AppImage
[android]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Android-universal.apk
[android-arm64]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Android-arm64-v8a.apk
[android-arm]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Android-armeabi-v7a.apk
[android-x86]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Android-x86.apk
[android-x64]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Android-x86_64.apk
[chrome]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Extension-chrome.zip
[edge]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Extension-edge.zip
[firefox]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Extension-firefox.zip
[safari]: https://github.com/NuraChain/Wallet/releases/latest/download/Nura-Wallet-Extension-safari.zip
