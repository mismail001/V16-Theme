# Copyright (c) 2026, Ali Raza and contributors
# For license information, please see license.txt

"""Record counts for the DocType links in the desk sidebar.

One request for the whole sidebar rather than one per link. Each count goes
through `frappe.get_list`, so it is the number this user would see on opening
the list: read permission, User Permissions and the link's own filters all
narrow it. A DocType the user cannot read gets no count instead of an error,
so one restricted link does not cost the rest of the sidebar its numbers.

Off when Swift Theme Settings > Show Sidebar Record Counts is off, whatever
the client asks: a stale desk tab must not keep running the queries.
"""

import json

import frappe
from frappe.permissions import has_permission

# A sidebar has a few dozen links at most; anything past this is not one.
MAX_LINKS = 100


@frappe.whitelist()
def get_sidebar_counts(links: str | list) -> dict:
	"""`links` is a list of {key, doctype, filters}; returns {key: count}."""
	if not frappe.db.get_single_value("Swift Theme Settings", "enable_sidebar_counts"):
		return {}
	if isinstance(links, str):
		links = json.loads(links)

	out = {}
	for link in (links or [])[:MAX_LINKS]:
		key = link.get("key")
		doctype = link.get("doctype")
		if not key or not doctype or not frappe.db.exists("DocType", doctype):
			continue
		if frappe.get_meta(doctype).issingle or not has_permission(doctype, "read", print_logs=False):
			continue
		try:
			rows = frappe.get_list(
				doctype,
				filters=link.get("filters") or None,
				fields=[{"COUNT": "*", "as": "count"}],
			)
			out[key] = rows[0].count if rows else 0
		except Exception:
			# A bad saved filter on one link must not blank the others.
			frappe.clear_last_message()
	return out
