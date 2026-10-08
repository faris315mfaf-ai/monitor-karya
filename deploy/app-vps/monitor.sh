#!/usr/bin/env bash
# Read-only; no external notification. Nonzero is the integration signal for an operator/monitor.
# */5 * * * * bash /srv/apps/monitor-karya/deploy/app-vps/monitor.sh >> /srv/apps/monitor-karya/monitor.log 2>&1
set -euo pipefail
docker exec -i monitor-karya-monitor-karya-1 node --input-type=module < "$(dirname "$0")/monitor-check.mjs"
