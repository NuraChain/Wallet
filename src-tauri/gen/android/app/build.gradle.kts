import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")

    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// Release signing, when a keystore has been provided. The file lives outside version control (see
// .gitignore) and is written by CI from repository secrets, or created by hand for a local release
// build. Absent it, the release build stays unsigned and simply cannot be installed.
val keystoreProperties = Properties().apply {
    val propFile = rootProject.file("keystore.properties")

    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val keystorePath: String? = keystoreProperties.getProperty("storeFile")

// The version, from the one file that declares it. `tauri.properties` above is written by the Tauri
// CLI during its own build and is git-ignored, so it is absent on a fresh clone and whenever Gradle is
// driven directly — and the literals that used to stand in for it then were `1` and `1.0`, which is
// what the installed app actually reported however many times Cargo.toml was bumped.
//
// Only the first `version` line is taken: dependencies declare theirs as `name = { version = ... }`,
// which does not start the line.
val cargoVersion: String = rootProject.file("../../Cargo.toml")
    .takeIf { it.exists() }
    ?.readLines()
    ?.firstOrNull { it.trimStart().startsWith("version") }
    ?.substringAfter('"')
    ?.substringBefore('"')
    ?: "1.0"

// Android orders updates by this number and refuses to go backwards, so it has to rise with the
// version and mean the same thing however the build was started. The weighting is the Tauri CLI's own,
// which matters on the day one build writes `tauri.properties` and the next one does not.
val cargoVersionCode: Int = cargoVersion.split('.').let { parts ->
    val part = { index: Int -> parts.getOrNull(index)?.trim()?.toIntOrNull() ?: 0 }

    part(0) * 1000000 + part(1) * 1000 + part(2)
}

android {
    compileSdk = 36
    ndkVersion = "29.0.13113456 rc1"
    namespace = "wallet.nurachain.net"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"

        applicationId = "wallet.nurachain.net"
        minSdk = 24
        targetSdk = 36
        // What the CLI wrote wins, since that is where an explicit `versionCode` in the Tauri config
        // lands; Cargo.toml answers for every build the CLI did not prepare.
        versionCode = tauriProperties.getProperty("tauri.android.versionCode")?.toIntOrNull() ?: cargoVersionCode
        versionName = tauriProperties.getProperty("tauri.android.versionName") ?: cargoVersion
    }

    signingConfigs {
        create("release") {
            if (keystorePath != null) {
                // Resolved against gen/android, so keystore.properties can name the file
                // plainly and stay portable between a Windows checkout and a Linux runner.
                storeFile = rootProject.file(keystorePath)
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        getByName("debug") {
            // Signed with the release key when there is one, so a dev build can replace an installed
            // release build instead of being refused by it. Android will not update a package across a
            // change of signing key: it answers INSTALL_FAILED_UPDATE_INCOMPATIBLE, and the only way
            // out is uninstalling first — which takes the app's private storage with it, and that is
            // where the encrypted recovery phrase lives. Matching the signature avoids ever having to
            // make that trade on a device holding a wallet.
            //
            // Without a keystore this stays on the default debug key, which is the same thing every
            // other Android project does.
            if (keystorePath != null) {
                signingConfig = signingConfigs.getByName("release")
            }

            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false

            manifestPlaceholders["usesCleartextTraffic"] = "true"

            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }

        getByName("release") {
            // Attaching an empty config would fail the build outright, so an unconfigured checkout
            // still produces the (uninstallable) unsigned artifact rather than breaking.
            if (keystorePath != null) {
                signingConfig = signingConfigs.getByName("release")
            }

            isMinifyEnabled = true
            // Drops the resources of the AndroidX and Material UI the WebView never inflates, which
            // is most of what those libraries ship. Safe here because nothing resolves a resource by
            // name at runtime: all that is left is reachable from the manifest or from the theme.
            isShrinkResources = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }.plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    buildFeatures {
        buildConfig = true
    }

    dependenciesInfo {
        includeInApk = false
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
}

apply(from = "tauri.build.gradle.kts")
