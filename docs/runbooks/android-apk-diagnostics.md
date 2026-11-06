# Diagnosing an Android preview APK that "won't install"

Written for GRA-904, after a preview APK was reported as crashing during
installation on a physical device and turned out to install and run fine on
every emulator we could point at it. The point of this runbook is to stop the
next person spending an hour standing up an Android SDK before they can say
anything at all about the artifact.

## 1. Get the APK

```bash
eas build:view <build-id> --json | jq -r '.artifacts.buildUrl'
curl -L -o preview.apk "<that url>"
```

## 2. Check the artifact before you blame the device

These four checks cover everything that makes an APK structurally
un-installable. All of them run on the file alone — no device needed.

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
BT=$ANDROID_HOME/build-tools/35.0.0

# a) minSdk must be <= the device's API level, and testOnly must be absent
apkanalyzer manifest min-sdk preview.apk
apkanalyzer manifest print preview.apk | grep -E 'testOnly|extractNativeLibs'

# b) the device's ABI must be in the APK
unzip -l preview.apk | grep -o 'lib/[^/]*' | sort -u

# c) signature schemes — v2 alone is correct for minSdk >= 24
$BT/apksigner verify --verbose preview.apk

# d) 16 KB page alignment (Pixel 8+/Android 15+ refuse unaligned libs)
$BT/zipalign -c -P 16 -v 4 preview.apk | tail -1
```

A failure in (a)–(d) is a build defect. All four passing means the APK is
sound and the failure is in the install path on that particular device —
storage, Play Protect, a leftover install signed with another key, or an
interrupted download. Say so instead of hunting for a code fix.

## 3. Reproduce on an emulator

One-time setup on an Apple Silicon machine (~15 min, ~4 GB):

```bash
brew install openjdk@17
brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
yes | sdkmanager --licenses
sdkmanager platform-tools emulator "platforms;android-35" "build-tools;35.0.0" \
  "system-images;android-35;google_apis;arm64-v8a"
avdmanager create avd -n geoerp -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_6
```

Use the **arm64-v8a** images, not x86_64 — on Apple Silicon x86_64 is emulated
and far too slow to tell a crash apart from a timeout.

Then:

```bash
emulator -avd geoerp -no-snapshot-save -no-boot-anim &
adb wait-for-device && adb shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 2; done'

adb logcat -c
adb logcat -v time > logcat.txt &
adb install -r preview.apk                                   # install-time failures land here
adb shell am start -n com.techingenius.geoerp/.MainActivity  # runtime crashes land in logcat
adb shell pidof com.techingenius.geoerp                      # empty == the process died
adb exec-out screencap -p > shot.png
```

Read the two failure classes apart:

| Symptom | Where it shows | Means |
|---|---|---|
| `INSTALL_FAILED_*` from `adb install` | installer | the package was rejected — see §2 |
| `FATAL EXCEPTION` / `SIGABRT` with our pid | logcat | our JS or native code crashed |
| app pid alive, blank screen | logcat `ReactNativeJS` | JS error or a failed query, not a crash |

## 4. Reaching a screen without logging in

`app/project/[id].tsx` sits at the router root with no auth guard, so the map
can be opened directly. Useful for checking that the Google Maps key renders
tiles when you do not have credentials for the environment the build points at:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "geoerpmobile://project/<uuid>" com.techingenius.geoerp
adb logcat -d | grep -i "Authorization failure"   # wrong/restricted Maps key
```

An empty grep means the Maps key was accepted. Grey tiles with no
authorization error on an old `google_apis` image are the image's bundled Play
Services, not our key.

## 5. Maps key restrictions

If the Maps key is restricted by Android app, it must list the package name
**and** the SHA-1 of the keystore that signed the build. EAS signs preview
builds with the EAS-managed keystore, which is *not* the debug keystore:

```bash
$BT/apksigner verify --print-certs preview.apk | grep 'SHA-1 digest'
```

That fingerprint plus `com.techingenius.geoerp` have to be on the key in Google
Cloud Console, or the map renders grey on real devices while working fine in
development.
