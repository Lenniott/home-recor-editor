#!/usr/bin/env bash
# One-time: npm run macos:setup
# Forever:  npm run bundle:mac
set -euo pipefail

KEYCHAIN_ACCOUNT="home-recor-editor"
KEYCHAIN_ID="apple-id"
KEYCHAIN_PASSWORD="apple-app-specific-password"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
dim() { printf '\033[2m%s\033[0m\n' "$*"; }

find_developer_id() {
  security find-identity -v -p codesigning \
    | awk -F'"' '/Developer ID Application/ { print $2; exit }'
}

team_id_from_identity() {
  # "Developer ID Application: Name (TEAMID)" → TEAMID
  echo "$1" | sed -n 's/.*(\([^)]*\))$/\1/p'
}

keychain_get() {
  local service="$1"
  security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$service" -w 2>/dev/null || true
}

keychain_set() {
  local service="$1"
  local value="$2"
  security delete-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$service" >/dev/null 2>&1 || true
  security add-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$service" -w "$value" >/dev/null
}

cmd_setup() {
  local identity
  identity="$(find_developer_id)"
  if [[ -z "$identity" ]]; then
    red "No Developer ID Application certificate in Keychain."
    echo "In Xcode: Settings → Accounts → your team → Manage Certificates → + → Developer ID Application"
    exit 1
  fi

  echo "Using signing identity:"
  echo "  $identity"
  echo

  local default_id
  default_id="$(keychain_get "$KEYCHAIN_ID")"
  if [[ -z "$default_id" ]]; then
    default_id="$(
      security find-identity -v -p codesigning \
        | awk -F'"' '/Apple Development:/ {
            n=$2
            sub(/^Apple Development: /,"",n)
            sub(/ \(.*\)$/,"",n)
            if (n ~ /@/) print n
            exit
          }'
    )"
  fi

  local apple_id
  if [[ -n "$default_id" ]]; then
    read -r -p "Apple ID email [$default_id]: " apple_id
    apple_id="${apple_id:-$default_id}"
  else
    read -r -p "Apple ID email: " apple_id
  fi
  if [[ -z "$apple_id" ]]; then
    red "Apple ID is required."
    exit 1
  fi

  echo
  echo "Create an app-specific password (not your Apple ID password):"
  echo "  https://appleid.apple.com → Sign-In and Security → App-Specific Passwords"
  echo "  Name it something like \"Tauri notarize\" and paste it here."
  echo
  read -r -s -p "App-specific password: " apple_password
  echo
  if [[ -z "$apple_password" ]]; then
    red "Password is required."
    exit 1
  fi

  keychain_set "$KEYCHAIN_ID" "$apple_id"
  keychain_set "$KEYCHAIN_PASSWORD" "$apple_password"

  echo
  echo "Saved to your login Keychain (not the git repo)."
  echo "Ship it with:  npm run bundle:mac"
}

load_signing_env() {
  local identity
  identity="$(find_developer_id)"
  if [[ -z "$identity" ]]; then
    red "No Developer ID Application certificate. Run: npm run macos:setup"
    exit 1
  fi

  local apple_id apple_password team_id
  apple_id="$(keychain_get "$KEYCHAIN_ID")"
  apple_password="$(keychain_get "$KEYCHAIN_PASSWORD")"
  team_id="$(team_id_from_identity "$identity")"

  if [[ -z "$apple_id" || -z "$apple_password" ]]; then
    red "Notarization login is not set up yet. Run: npm run macos:setup"
    exit 1
  fi

  export APPLE_SIGNING_IDENTITY="$identity"
  export APPLE_ID="$apple_id"
  export APPLE_PASSWORD="$apple_password"
  export APPLE_TEAM_ID="$team_id"
}

cmd_build() {
  load_signing_env
  dim "Signing as $APPLE_SIGNING_IDENTITY"
  dim "Notarizing as $APPLE_ID (team $APPLE_TEAM_ID)"
  exec npx tauri build --bundles dmg,app
}

case "${1:-build}" in
  setup) cmd_setup ;;
  build) cmd_build ;;
  *)
    echo "Usage: $0 [setup|build]"
    exit 1
    ;;
esac
