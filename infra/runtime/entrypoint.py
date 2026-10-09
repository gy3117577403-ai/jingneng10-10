"""Link immutable build assets without deleting a shared volume on every start."""

import os
from pathlib import Path
import sys

bench = Path('/home/frappe/frappe-bench')
target = bench / 'sites/assets'
baked = bench / 'assets'
if not os.path.lexists(target):
    try:
        target.symlink_to(baked, target_is_directory=True)
    except FileExistsError:
        pass  # Another service sharing this volume may have made the same link.
if not target.is_symlink() or target.resolve() != baked.resolve():
    raise SystemExit('Unexpected sites/assets path; preserve it and inspect before continuing.')
os.execvp(sys.argv[1], sys.argv[1:])
