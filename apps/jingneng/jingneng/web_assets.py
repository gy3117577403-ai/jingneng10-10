"""Version page assets from the deployed bytes, including same-version fixes."""
from functools import lru_cache
from hashlib import sha256
from pathlib import Path

import frappe


@lru_cache(maxsize=8)
def asset_version(*paths):
    digest = sha256()
    for path in paths:
        digest.update(Path(frappe.get_app_path('jingneng', 'public', path)).read_bytes())
    return digest.hexdigest()[:16]
