const {withAppBuildGradle} = require("@expo/config-plugins")

module.exports = function withAndroidSigningConfig(config) {
  return withAppBuildGradle(config, config => {
    let buildGradle = config.modResults.contents

    // Only add credentials if they don't exist
    if (!buildGradle.includes("releaseStorePassword =")) {
      const credentialsCode = `
/**
 * Disable Hermes by setting it to false.
 */
def hermesEnabled = false  // Set Hermes to false

/**
 * Release-Store credentials.
 */
def releaseStorePassword = project.hasProperty("MENTRAOS_UPLOAD_STORE_PASSWORD") ? project.property("MENTRAOS_UPLOAD_STORE_PASSWORD") : ""
def releaseKeyPassword = project.hasProperty("MENTRAOS_UPLOAD_KEY_PASSWORD") ? project.property("MENTRAOS_UPLOAD_KEY_PASSWORD") : ""
def releaseKeyAlias = project.hasProperty("MENTRAOS_UPLOAD_KEY_ALIAS") ? project.property("MENTRAOS_UPLOAD_KEY_ALIAS") : "upload"
`

      buildGradle = buildGradle.replace(
        /def jscFlavor = 'org\.webkit:android-jsc:\+'/,
        `def jscFlavor = 'org.webkit:android-jsc:+'${credentialsCode}`,
      )
    }

    // Only add release signing config if it doesn't exist
    if (!buildGradle.includes("storeFile file('../credentials/upload-keystore.jks')")) {
      const releaseSigningConfig = `
        release {
            storeFile file('../credentials/upload-keystore.jks')
            storePassword = releaseStorePassword
            keyAlias = releaseKeyAlias  
            keyPassword = releaseKeyPassword
        }`

      buildGradle = buildGradle.replace(/(signingConfigs\s*{\s*debug\s*{[^}]*})/, `$1${releaseSigningConfig}`)
    }

    // Update release build type to use release signing if not already updated
    if (
      buildGradle.includes("signingConfig signingConfigs.debug") &&
      buildGradle.includes("release {") &&
      !buildGradle.includes("releaseStorePassword ? signingConfigs.release")
    ) {
      buildGradle = buildGradle.replace(
        /release\s*{[^{}]*signingConfig signingConfigs\.debug/,
        "release {\n            signingConfig releaseStorePassword ? signingConfigs.release : signingConfigs.debug",
      )
    }

    // Only add AugmentOS dependencies if they don't exist
    if (!buildGradle.includes("implementation project(path: ':AugmentOSLib')")) {
      const augmentosDependendies = `
    // AugmentOSLib project dependency
    implementation project(path: ':AugmentOSLib')
    implementation project(path: ":augmentos_core")
    implementation project(path: ":SmartGlassesManager")
    implementation "androidx.lifecycle:lifecycle-service:2.6.1"
    implementation("org.greenrobot:eventbus:3.3.1")
`

      buildGradle = buildGradle.replace(
        /implementation\("com\.facebook\.react:react-android"\)/,
        `implementation("com.facebook.react:react-android")${augmentosDependendies}`,
      )
    }

    config.modResults.contents = buildGradle
    return config
  })
}
