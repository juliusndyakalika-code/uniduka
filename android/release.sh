#!/usr/bin/env bash
# Build a signed release of the Android shell.
#
#   ./release.sh            rebuild at the current version (no Play upload needed)
#   ./release.sh 1.1.0      bump to versionName 1.1.0 and increment versionCode
#
# Ordinary web deploys need NONE of this. The app loads mauzohalisi.com live, so
# shipping the web app ships the change. Rebuild only when something in
# twa-manifest.json changes: app name, icon, colours, shortcuts, or the origin.
set -euo pipefail
cd "$(dirname "$0")"

SIGN_DIR="$HOME/.mauzohalisi-signing"
[ -f "$SIGN_DIR/upload.keystore" ] || { echo "No keystore at $SIGN_DIR. Restore it from your backup; it cannot be regenerated."; exit 1; }

BW=$(command -v bubblewrap || echo "npx --yes @bubblewrap/cli")
export BUBBLEWRAP_KEYSTORE_PASSWORD="$(cat "$SIGN_DIR/keystore-password.txt")"
export BUBBLEWRAP_KEY_PASSWORD="$BUBBLEWRAP_KEYSTORE_PASSWORD"

if [ $# -ge 1 ]; then
  printf '%s\n' "$1" | $BW update
else
  $BW update --skipVersionUpgrade
fi

printf 'n\n' | $BW build --skipPwaValidation

echo
echo "Upload to Play Console:  $(pwd)/app-release-bundle.aab"
echo "Sideload for testing:    $(pwd)/app-release-signed.apk"
grep -E 'versionCode |versionName ' app/build.gradle | sed 's/^/  /'
