#!/usr/bin/env bash
# Generates deploy/mosquitto/passwordfile for the mosquitto broker used by
# docker-compose.yml. mosquitto.conf sets allow_anonymous false and requires
# this file to exist — the broker will refuse to start without it.
#
# Usage:
#   ./deploy/mosquitto/generate-credentials.sh <username>
#   (you will be prompted for a password)
#
# Re-run with a different username to add additional credentials to the same
# file (mosquitto_passwd -b appends/updates in place).
#
# Requires Docker (uses the eclipse-mosquitto image so no local mosquitto
# install is needed). Set MQTT_USERNAME / MQTT_PASSWORD in .env to the same
# values so the app container can authenticate.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASSWORD_FILE="$SCRIPT_DIR/passwordfile"
USERNAME="${1:?Usage: generate-credentials.sh <username>}"

touch "$PASSWORD_FILE"

docker run --rm -it \
  -v "$PASSWORD_FILE:/mosquitto/config/passwordfile" \
  eclipse-mosquitto:2 \
  mosquitto_passwd /mosquitto/config/passwordfile "$USERNAME"

echo "Credentials written to $PASSWORD_FILE (not committed — see .gitignore)."
echo "Set MQTT_USERNAME=\"$USERNAME\" and MQTT_PASSWORD=<the password you entered> in .env."
