plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.sy.antivirus"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sy.antivirus"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"

        // AdMob IDs. The defaults are Google's public *test* IDs (they show sample ads and pay nothing).
        // Put your own in ~/.gradle/gradle.properties or pass -PadmobAppId=... -PadmobBannerId=...
        val admobAppId = (project.findProperty("admobAppId") as String?) ?: "ca-app-pub-3940256099942544~3347511713"
        val admobBannerId = (project.findProperty("admobBannerId") as String?) ?: "ca-app-pub-3940256099942544/6300978111"
        manifestPlaceholders["admobAppId"] = admobAppId
        buildConfigField("String", "ADMOB_BANNER_ID", "\"$admobBannerId\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the APK installs directly. Use your own key for publishing.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(project(":engine"))

    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("com.google.android.gms:play-services-ads:23.6.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
