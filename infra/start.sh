#!/bin/bash
set -euo pipefail
exec /home/frappe/frappe-bench/env/bin/gunicorn \
  --chdir=/home/frappe/frappe-bench/sites \
  --bind=0.0.0.0:8000 --workers=2 --threads=2 --worker-class=gthread \
  --worker-tmp-dir=/dev/shm --timeout=120 --preload frappe.app:application
