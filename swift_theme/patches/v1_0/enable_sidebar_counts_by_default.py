"""Turn sidebar record counts on for sites that already existed.

Same gap as enable_backdrops_by_default: the new `enable_sidebar_counts` Check
comes back as 0 on an existing Single row, and _seed_settings leaves a 0
alone, so every upgrading site would start with the feature off while the
field's default and a fresh install say on.

Runs once; an admin who turns it off afterwards keeps it off.
"""

import frappe

FIELD = "enable_sidebar_counts"


def execute():
    if not frappe.db.exists("DocType", "Swift Theme Settings"):
        return

    if not frappe.get_meta("Swift Theme Settings").has_field(FIELD):
        return

    # Written directly rather than through the document: a save validates every
    # other field too, and this patch has no business failing over one of them.
    frappe.db.set_single_value("Swift Theme Settings", FIELD, 1)
    frappe.clear_cache()
