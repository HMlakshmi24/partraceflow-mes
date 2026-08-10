#!/usr/bin/env bash
# Generates a self-signed TLS certificate for LOCAL/DEV use of the Docker
# Compose stack only. Browsers will show a trust warning for this cert —
# that is expected. For a real deployment, replace the files this script
# writes into deploy/nginx/certs/ with certificates from a real CA (e.g.
# Let's Encrypt/certbot, or your organization's internal CA) for your
# actual domain name, keeping the same filenames (fullchain.pem, privkey.pem)
# so default.conf doesn't need to change.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/certs"
DOMAIN="${1:-localhost}"

mkdir -p "$CERT_DIR"

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -days 365 \
  -subj "/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN"

chmod 600 "$CERT_DIR/privkey.pem"
echo "Self-signed dev certificate written to $CERT_DIR (gitignored, not committed)."
echo "Replace with a real CA-issued certificate before deploying beyond localhost."
