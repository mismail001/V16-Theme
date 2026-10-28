"""Figures for the Business Overview dashboard on the desk page.

The desk shows the ZATCA dashboard when KSA Compliance is installed, and this one otherwise (see
swift-desk-dashboard.js). It has to work on any site: ERPNext figures appear only when ERPNext is installed and the
user can read the doctype behind them, and the user's open ToDos are always there.
"""

from typing import Optional

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

OVERDUE_LIMIT = 8
TODO_LIMIT = 8


@frappe.whitelist()
def get_overview(from_date: str, to_date: str, company: Optional[str] = None) -> dict:
    has_erpnext = "erpnext" in frappe.get_installed_apps()
    company = company or None

    kpis = []
    overdue = None
    currency = None
    if has_erpnext:
        currency = _currency(company)
        period = ["between", [getdate(from_date), getdate(to_date)]]
        if _can_read("Sales Invoice"):
            kpis.append(_period_total("Sales Invoice", period, company, "sales", _("Sales"), "green", "up"))
            kpis.append(_outstanding("Sales Invoice", company, "receivables", _("Receivables"), "blue", "inbox"))
            overdue = _overdue_sales(company)
        if _can_read("Purchase Invoice"):
            kpis.append(_period_total("Purchase Invoice", period, company, "purchases", _("Purchases"), "orange", "down"))
            kpis.append(_outstanding("Purchase Invoice", company, "payables", _("Payables"), "red", "outbox"))

    return {
        "has_erpnext": has_erpnext,
        "currency": currency,
        "kpis": kpis,
        "overdue": overdue,
        "todos": _open_todos(),
    }


def _can_read(doctype: str) -> bool:
    return bool(frappe.has_permission(doctype, "read"))


def _currency(company: Optional[str]) -> Optional[str]:
    company = company or frappe.defaults.get_user_default("Company")
    if company:
        return frappe.get_cached_value("Company", company, "default_currency")
    return frappe.db.get_default("currency")


def _with_company(filters: dict, company: Optional[str]) -> dict:
    if company:
        filters["company"] = company
    return filters


def _sum(doctype: str, field: str, filters: dict) -> tuple[float, int]:
    row = frappe.get_list(
        doctype,
        filters=filters,
        fields=[{"SUM": field, "as": "total"}, {"COUNT": "*", "as": "count"}],
    )[0]
    return flt(row.total), row["count"] or 0


def _period_total(doctype, period, company, key, label, color, glyph) -> dict:
    # Returns are submitted invoices with negative totals, so summing them nets them off the period's figure
    filters = _with_company({"docstatus": 1, "posting_date": period}, company)
    total, count = _sum(doctype, "base_grand_total", filters)
    return {
        "key": key,
        "label": label,
        "value": total,
        "count": count,
        "color": color,
        "glyph": glyph,
        "hint": _("{0} invoice(s) in period").format(count),
        "doctype": doctype,
        "route_filters": {"docstatus": 1},
    }


def _outstanding(doctype, company, key, label, color, glyph) -> dict:
    # Outstanding is not tied to the period: an old unpaid invoice is still owed today
    filters = _with_company({"docstatus": 1, "outstanding_amount": [">", 0]}, company)
    total, count = _sum(doctype, "outstanding_amount", filters)
    return {
        "key": key,
        "label": label,
        "value": total,
        "count": count,
        "color": color,
        "glyph": glyph,
        "hint": _("{0} unpaid invoice(s)").format(count),
        "doctype": doctype,
        "route_filters": {"docstatus": 1, "outstanding_amount": [">", 0]},
    }


def _overdue_sales(company: Optional[str]) -> dict:
    filters = _with_company(
        {"docstatus": 1, "outstanding_amount": [">", 0], "due_date": ["<", nowdate()]}, company
    )
    rows = frappe.get_list(
        "Sales Invoice",
        filters=filters,
        fields=["name", "customer_name", "due_date", "outstanding_amount", "currency"],
        order_by="due_date asc",
        limit_page_length=OVERDUE_LIMIT + 1,
    )
    return {"rows": rows[:OVERDUE_LIMIT], "has_more": len(rows) > OVERDUE_LIMIT}


def _open_todos() -> list[dict]:
    return frappe.get_list(
        "ToDo",
        filters={"allocated_to": frappe.session.user, "status": "Open"},
        fields=["name", "description", "reference_type", "reference_name", "date", "priority"],
        order_by="creation desc",
        limit_page_length=TODO_LIMIT,
    )
