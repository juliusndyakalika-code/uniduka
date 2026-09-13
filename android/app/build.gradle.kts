plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace  = "com.mauzohalisi.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mauzohalisi.app"
        minSdk        = 24          // Android 7. Below this TLS 1.2 is unreliable on Tanzanian handsets.
        targetSdk     = 36
        versionCode   = 1
        versionName   = "1.0.0"

        // The API this app talks to. Kept in the build so a debug build can be
        // pointed at a local server without editing source.
        buildConfigField("String", "API_BASE", "\"https://api-production-00d0.up.railway.app/api/v1\"")
    }

    buildTypes {
        debug {
            // Lets the native build sit alongside the existing Capacitor app on
            // one device while this is being written.
            applicationIdSuffix = ".dev"
            versionNameSuffix   = "-dev"

            // A debug build points at whatever MAUZO_API_BASE says, defaulting to
            // a local server reached over `adb reverse`. Release is untouched and
            // always talks to production.
            val local = System.getenv("MAUZO_API_BASE") ?: "http://localhost:3015/api/v1"
            buildConfigField("String", "API_BASE", "\"$local\"")
        }
        release {
            isMinifyEnabled   = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    signingConfigs {
        create("release") {
            // Same keystore as before, outside the repo. Skipped when absent so a
            // clone without the key still builds.
            val dir = File(System.getProperty("user.home"), ".mauzohalisi-signing")
            val ks  = File(dir, "upload.keystore")
            if (ks.exists()) {
                storeFile     = ks
                storePassword = File(dir, "keystore-password.txt").readText().trim()
                keyAlias      = "mauzohalisi"
                keyPassword   = File(dir, "keystore-password.txt").readText().trim()
            }
        }
    }

    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.4")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Session storage. DataStore rather than SharedPreferences because reads are
    // suspending, so the token is never fetched on the main thread.
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
}
