#!/usr/bin/env bash
# Build a signed release and publish it to GitHub Releases.
#
#   ./release.sh            build only
#   ./release.sh 1.1.0      set the version, build, and publish a release
#
# Ordinary web deploys need none of this: the shell loads the live site, so
# shipping the web app ships the change. Cut a new build only when something in
# the shell changes — the fallback screen, printing, permissions, the start URL.
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
SIGN_DIR="$HOME/.mauzohalisi-signing"
[ -f "$SIGN_DIR/upload.keystore" ] || { echo "No keystore at $SIGN_DIR. Restore it from your backup; it cannot be regenerated."; exit 1; }

if [ $# -ge 1 ]; then
  VERSION="$1"
  # Play rejects a repeat versionCode, so it always moves up.
  CODE=$(grep -oE 'versionCode [0-9]+' app/build.gradle | grep -oE '[0-9]+')
  NEXT=$((CODE + 1))
  sed -i '' "s/versionCode $CODE/versionCode $NEXT/" app/build.gradle
  sed -i '' "s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" app/build.gradle
  echo "version $VERSION (code $NEXT)"
fi

( cd .. && npx cap sync android >/dev/null )
./gradlew assembleRelease bundleRelease

APK=app/build/outputs/apk/release/app-release.apk
AAB=app/build/outputs/bundle/release/app-release.aab
VERSION=$(grep -oE 'versionName "[^"]*"' app/build.gradle | cut -d'"' -f2)
NAMED="MauzoHalisi-$VERSION.apk"
cp "$APK" "/tmp/$NAMED"

echo
echo "APK for sideloading : /tmp/$NAMED"
echo "AAB for Play        : $(pwd)/$AAB"

if [ $# -ge 1 ]; then
  gh release create "v$VERSION" "/tmp/$NAMED" \
    --title "MauzoHalisi $VERSION" \
    --notes "Android app, signed release build. Android 7 and up.

Download the APK on your phone and tap it, then allow installs from that app when asked.

If a debug build is already installed, uninstall it first: release and debug are signed with different keys and Android will refuse to replace one with the other."
fi
