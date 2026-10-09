# Jingneng custom Frappe app

F0 runtime foundation. Business code belongs here, not in the upstream Frappe checkout.

- `jingneng/foundation/doctype/`: version-controlled data models.
- `jingneng/setup.py`: repeatable demonstration data initialization.
- `jingneng/api/`: authenticated application endpoints.
- `jingneng/www/` and `jingneng/public/`: initial environment acceptance page.
- `jingneng/ai/`: explicit disabled provider boundary; no model requests in F0.

The initial acceptance page uses Frappe's server-rendered page support. The planned employee workbench and Vue/Frappe UI belong to F1, not to the F0 acceptance page.
