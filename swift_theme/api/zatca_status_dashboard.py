import dataclasses
import json
from collections import Counter
from datetime import datetime, timedelta
from typing import Optional

import frappe
from frappe.query_builder import DocType
from frappe.query_builder.functions import Coalesce, Count
from frappe.utils import add_days, cint, getdate, now_datetime
from pypika import Order
from pypika.queries import QueryBuilder

# The ZATCA dashboard reads KSA Compliance's doctypes and parsers. The desk only calls it when that app is installed on
# the site (see swift-desk-dashboard.js), and _ensure_installed() rejects any other call before touching its tables.
from ksa_compliance.translation import ft
from ksa_compliance.zatca_api import WarningOrError

# How the dashboard buckets [SalesInvoiceAdditionalFields.integration_status]. Only the latest SIAF per invoice counts.
WARNING_STATUSES = ['Accepted with warnings']
# Accepted without warnings. Together with WARNING_STATUSES this is everything ZATCA accepted
ACCEPTED_STATUSES = ['Accepted', 'Clearance switched off', 'Duplicate']
REJECTED_STATUSES = ['Rejected']
# Sent at least once, but ZATCA asked us to retry (rate limits, 5xx); the batch job will pick it up again
DELAYED_STATUSES = ['Resend']
# Created locally, never sent yet. Empty status is treated the same way
NOT_POSTED_STATUSES = ['Ready For Batch', 'Corrected', '']
PENDING_STATUSES = DELAYED_STATUSES + NOT_POSTED_STATUSES

# ZATCA requires simplified invoices to be reported within 24 hours of issue. Standard invoices must be cleared before
# being shared with the buyer, so a pending standard invoice is at least as urgent; we apply the same window to both.
REPORTING_WINDOW_HOURS = 24
DEADLINE_WARNING_HOURS = 18

# Upper bound on how many rejected/warned invoices we inspect when building error patterns
PATTERN_SAMPLE_SIZE = 2000
PAGE_LENGTH = 50

SIAF = DocType('Sales Invoice Additional Fields')
SI = DocType('Sales Invoice')
POS = DocType('POS Invoice')
PE = DocType('Payment Entry')


def _ensure_installed() -> None:
    if 'ksa_compliance' not in frappe.get_installed_apps():
        frappe.throw(frappe._('KSA Compliance is not installed on this site'))
    frappe.has_permission('Sales Invoice Additional Fields', throw=True)


@frappe.whitelist()
def get_dashboard_data(from_date: str, to_date: str, company: Optional[str] = None) -> dict:
    _ensure_installed()

    now = now_datetime()
    counts = _get_status_counts(from_date, to_date, company)
    accepted = sum(counts.get(s, 0) for s in ACCEPTED_STATUSES)
    warnings = sum(counts.get(s, 0) for s in WARNING_STATUSES)
    rejected = sum(counts.get(s, 0) for s in REJECTED_STATUSES)
    delayed = sum(counts.get(s, 0) for s in DELAYED_STATUSES)
    not_posted = sum(counts.get(s, 0) for s in NOT_POSTED_STATUSES)
    total = accepted + warnings + rejected + delayed + not_posted
    sent = accepted + warnings + rejected

    overdue = _count(_filtered_query('overdue', from_date, to_date, company, now))
    approaching = _count(_filtered_query('approaching', from_date, to_date, company, now))

    if overdue:
        health = 'Critical'
    elif rejected or approaching or delayed:
        health = 'Needs Attention'
    else:
        health = 'Healthy'

    return {
        'groups': {
            'accepted': accepted,
            'warnings': warnings,
            'rejected': rejected,
            'delayed': delayed,
            'not_posted': not_posted,
        },
        'summary': {
            'total': total,
            'submission_rate': round(sent * 100 / total, 1) if total else None,
            'acceptance_rate': round((accepted + warnings) * 100 / sent, 1) if sent else None,
            'overdue': overdue,
            'approaching': approaching,
            'health': health,
        },
        'issues': _get_issues(from_date, to_date, company, now, overdue, approaching),
        'error_patterns': _get_error_patterns(from_date, to_date, company),
        'reporting_window_hours': REPORTING_WINDOW_HOURS,
    }


@frappe.whitelist()
def get_invoices(group: str, from_date: str, to_date: str, company: Optional[str] = None, start: int = 0) -> dict:
    _ensure_installed()

    now = now_datetime()
    start = cint(start)
    query = _filtered_query(group, from_date, to_date, company, now).select(
        SIAF.name,
        SIAF.sales_invoice,
        SIAF.invoice_doctype,
        SIAF.integration_status,
        SIAF.invoice_type_transaction,
        SIAF.validation_errors,
        SIAF.creation,
        SIAF.last_attempt,
        Coalesce(SI.posting_date, POS.posting_date, PE.posting_date).as_('posting_date'),
        Coalesce(SI.customer_name, POS.customer_name, PE.party_name).as_('customer'),
        Coalesce(SI.grand_total, POS.grand_total, PE.paid_amount).as_('amount'),
        Coalesce(SI.currency, POS.currency, PE.paid_from_account_currency).as_('currency'),
    )
    # Pending invoices: oldest first, since they are closest to the deadline. Everything else: most recent first.
    is_pending_group = group in ('delayed', 'not_posted', 'overdue', 'approaching', 'local_validation')
    query = query.orderby(SIAF.creation, order=Order.asc if is_pending_group else Order.desc)
    rows = query.limit(PAGE_LENGTH + 1).offset(start).run(as_dict=True)

    has_more = len(rows) > PAGE_LENGTH
    rows = rows[:PAGE_LENGTH]
    logs = _get_latest_logs([r.name for r in rows])
    return {
        'invoices': [_build_invoice_row(r, logs.get(r.name), now) for r in rows],
        'has_more': has_more,
        'next_start': start + PAGE_LENGTH,
    }


def _base_query(from_date: str, to_date: str, company: Optional[str]) -> QueryBuilder:
    # A SIAF can belong to a Sales Invoice, POS Invoice or Payment Entry, so we join all three and coalesce
    query = (
        frappe.qb.from_(SIAF)
        .left_join(SI)
        .on((SIAF.invoice_doctype == 'Sales Invoice') & (SI.name == SIAF.sales_invoice))
        .left_join(POS)
        .on((SIAF.invoice_doctype == 'POS Invoice') & (POS.name == SIAF.sales_invoice))
        .left_join(PE)
        .on((SIAF.invoice_doctype == 'Payment Entry') & (PE.name == SIAF.sales_invoice))
        .where((SIAF.is_latest == 1) & (SIAF.docstatus < 2))
        .where(SIAF.creation >= getdate(from_date))
        .where(SIAF.creation < add_days(getdate(to_date), 1))
    )
    if company:
        query = query.where(Coalesce(SI.company, POS.company, PE.company) == company)
    return query


def _filtered_query(
    group: str, from_date: str, to_date: str, company: Optional[str], now: datetime
) -> QueryBuilder:
    query = _base_query(from_date, to_date, company)
    status = Coalesce(SIAF.integration_status, '')
    overdue_cutoff = now - timedelta(hours=REPORTING_WINDOW_HOURS)
    warning_cutoff = now - timedelta(hours=DEADLINE_WARNING_HOURS)

    if group == 'accepted':
        return query.where(status.isin(ACCEPTED_STATUSES))
    if group == 'rejected':
        return query.where(status.isin(REJECTED_STATUSES))
    if group == 'delayed':
        return query.where(status.isin(DELAYED_STATUSES))
    if group == 'not_posted':
        return query.where(status.isin(NOT_POSTED_STATUSES))
    if group == 'warnings':
        return query.where(status.isin(WARNING_STATUSES))
    if group == 'overdue':
        return query.where(status.isin(PENDING_STATUSES) & (SIAF.creation < overdue_cutoff))
    if group == 'approaching':
        return query.where(
            status.isin(PENDING_STATUSES) & (SIAF.creation >= overdue_cutoff) & (SIAF.creation < warning_cutoff)
        )
    if group == 'local_validation':
        return query.where(status.isin(PENDING_STATUSES) & (Coalesce(SIAF.validation_errors, '') != ''))

    frappe.throw(ft('Unknown status group: $group', group=group))


def _count(query: QueryBuilder) -> int:
    return query.select(Count('*').as_('count')).run(as_dict=True)[0]['count']


def _get_status_counts(from_date: str, to_date: str, company: Optional[str]) -> Counter:
    rows = (
        _base_query(from_date, to_date, company)
        .select(SIAF.integration_status, Count('*').as_('count'))
        .groupby(SIAF.integration_status)
        .run(as_dict=True)
    )
    counts = Counter()
    for row in rows:
        counts[row.integration_status or ''] += row['count']
    return counts


def _get_issues(
    from_date: str,
    to_date: str,
    company: Optional[str],
    now: datetime,
    overdue: int,
    approaching: int,
) -> list[dict]:
    issues = []
    if overdue:
        issues.append(
            {
                'severity': 'red',
                'group': 'overdue',
                'count': overdue,
                'title': ft('Past the $hours-hour reporting deadline', hours=REPORTING_WINDOW_HOURS),
            }
        )
    if approaching:
        issues.append(
            {
                'severity': 'orange',
                'group': 'approaching',
                'count': approaching,
                'title': ft('Approaching the reporting deadline'),
            }
        )

    local_validation = _count(_filtered_query('local_validation', from_date, to_date, company, now))
    if local_validation:
        issues.append(
            {
                'severity': 'orange',
                'group': 'local_validation',
                'count': local_validation,
                'title': ft('Pending invoices that failed local XML validation'),
            }
        )

    settings_filters = {'status': 'Active', 'enable_zatca_integration': 1}
    if company:
        settings_filters['company'] = company
    for settings in frappe.get_all(
        'ZATCA Business Settings',
        filters=settings_filters,
        fields=['name', 'company', 'production_security_token', 'production_request_id'],
    ):
        if not settings.production_security_token or not settings.production_request_id:
            issues.append(
                {
                    'severity': 'red',
                    'doctype': 'ZATCA Business Settings',
                    'name': settings.name,
                    'title': ft('$company has no production CSID; invoices cannot be sent', company=settings.company),
                }
            )

    return issues


def _get_error_patterns(from_date: str, to_date: str, company: Optional[str]) -> list[dict]:
    rows = (
        _base_query(from_date, to_date, company)
        .select(SIAF.name, SIAF.integration_status)
        .where(SIAF.integration_status.isin(['Rejected', 'Accepted with warnings']))
        .orderby(SIAF.creation, order=Order.desc)
        .limit(PATTERN_SAMPLE_SIZE)
        .run(as_dict=True)
    )
    logs = _get_latest_logs([r.name for r in rows])

    # Count invoices affected per error, not raw occurrences, so one bad invoice with repeated lines doesn't dominate
    counter: Counter = Counter()
    details: dict[tuple, dict] = {}
    for row in rows:
        log = logs.get(row.name)
        if not log:
            continue
        errors, warnings = _parse_zatca_message(log.zatca_message)
        issues = [('error', e) for e in errors] if row.integration_status == 'Rejected' else []
        issues += [('warning', w) for w in warnings]
        seen = set()
        for kind, issue in issues:
            key = (kind, issue['code']) if issue['code'] != 'No Code' else (kind, issue['message'])
            if key in seen:
                continue
            seen.add(key)
            counter[key] += 1
            details.setdefault(key, {'type': kind, **issue})

    return [{**details[key], 'count': count} for key, count in counter.most_common(10)]


def _get_latest_logs(siaf_names: list[str]) -> dict:
    if not siaf_names:
        return {}

    logs = frappe.get_all(
        'ZATCA Integration Log',
        filters={'invoice_additional_fields_reference': ['in', siaf_names]},
        fields=['invoice_additional_fields_reference', 'zatca_message', 'zatca_http_status_code', 'creation'],
        order_by='creation desc',
    )
    latest = {}
    for log in logs:
        latest.setdefault(log.invoice_additional_fields_reference, log)
    return latest


def _parse_zatca_message(raw: Optional[str]) -> tuple[list[dict], list[dict]]:
    """Extracts (errors, warnings) from a raw ZATCA response stored on [ZATCAIntegrationLog.zatca_message]"""
    if not raw:
        return [], []

    try:
        data = json.loads(raw)
    except ValueError:
        # Non-JSON responses (gateway HTML pages, connection errors)
        return [_as_dict(WarningOrError.from_json(raw.strip()[:300]))], []

    if not isinstance(data, dict):
        return [_as_dict(WarningOrError.from_json(str(data)[:300]))], []

    results = data.get('validationResults') or {}
    errors = [_as_dict(WarningOrError.from_json(e)) for e in results.get('errorMessages') or []]
    warnings = [_as_dict(WarningOrError.from_json(w)) for w in results.get('warningMessages') or []]
    if not errors and not results:
        # Authentication and similar errors don't carry validationResults
        message = data.get('message') or data.get('error') or data.get('errors')
        if message:
            errors = [_as_dict(WarningOrError.from_json(str(message)[:300]))]
    return errors, warnings


def _as_dict(issue: WarningOrError) -> dict:
    return dataclasses.asdict(issue)


def _split_local_validation(validation_errors: Optional[str]) -> list[dict]:
    lines = [line.strip() for line in (validation_errors or '').splitlines() if line.strip()]
    return [{'category': 'Local XML validation', 'code': 'No Code', 'message': line} for line in lines]


def _build_invoice_row(row, log, now: datetime) -> dict:
    status = row.integration_status or ''
    errors, warnings = _parse_zatca_message(log.zatca_message) if log else ([], [])
    local_errors = _split_local_validation(row.validation_errors)
    is_pending = status in PENDING_STATUSES

    pending_hours = None
    deadline = None
    if is_pending:
        pending_hours = round((now - row.creation).total_seconds() / 3600, 1)
        if pending_hours >= REPORTING_WINDOW_HOURS:
            deadline = 'overdue'
        elif pending_hours >= DEADLINE_WARNING_HOURS:
            deadline = 'approaching'

    if status in REJECTED_STATUSES:
        reason = ft('Rejected by ZATCA') if errors else ft('Rejected by ZATCA; no validation details returned')
    elif status in DELAYED_STATUSES:
        code = log.zatca_http_status_code if log else None
        reason = ft('ZATCA asked to retry (HTTP $code); queued for the next sync', code=code or '?')
    elif status in NOT_POSTED_STATUSES:
        reason = ft('Failed local XML validation') if local_errors else ft('Waiting to be sent to ZATCA')
    elif status == 'Accepted with warnings':
        reason = ft('Accepted with $count warning(s)', count=len(warnings))
    else:
        reason = ''

    is_standard = (row.invoice_type_transaction or '').startswith('01')
    return {
        'siaf': row.name,
        'invoice': row.sales_invoice,
        'invoice_doctype': row.invoice_doctype,
        'invoice_type': 'Standard' if is_standard else 'Simplified',
        'posting_date': row.posting_date,
        'customer': row.customer,
        'amount': row.amount,
        'currency': row.currency,
        'status': status or 'Ready For Batch',
        'reason': reason,
        'errors': errors if status in REJECTED_STATUSES or status in DELAYED_STATUSES else [],
        'warnings': warnings,
        'local_errors': local_errors,
        'pending_hours': pending_hours,
        'deadline': deadline,
        'last_attempt': row.last_attempt,
    }
