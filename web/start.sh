#!/bin/sh
PORT=${PORT:-80}

# The API lives on its own host, so the CSP has to name it in connect-src.
# Derived from the same variable the build uses, rather than hardcoded, so the
# policy cannot drift from where the app actually sends its requests.
# Falls back to allowing any https origin only if nothing is configured, which
# is weaker but still forbids plaintext and keeps the app working.
API_ORIGIN=$(printf '%s' "${VITE_API_URL:-}" | sed -E 's#^(https?://[^/]+).*#\1#')
case "$API_ORIGIN" in
  http*) API_ORIGIN_WS=$(printf '%s' "$API_ORIGIN" | sed -e 's#^http#ws#') ;;
  *)     API_ORIGIN="https:"; API_ORIGIN_WS="wss:" ;;
esac
export API_ORIGIN API_ORIGIN_WS

envsubst '$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
envsubst '$API_ORIGIN $API_ORIGIN_WS' \
  < /etc/nginx/conf.d/security-headers.conf.template \
  > /etc/nginx/conf.d/security-headers.conf
echo "CSP connect-src allows: ${API_ORIGIN} ${API_ORIGIN_WS}"
exec nginx -g 'daemon off;'
