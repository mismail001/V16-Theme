// Business Overview dashboard, shown on the desk page (/desk) when KSA Compliance isn't installed.
//
// It borrows the ZATCA dashboard's layout and styles (zsd-*), so both dashboards look like one family and follow the
// theme the same way. ERPNext figures appear only when ERPNext is installed and the user may read them; the user's
// open ToDos are always there, so the pane is never empty on a plain Frappe site.

import { set_zsd_style, zsd_glyph } from "./swift-zatca-dashboard.js";

const SOD_METHOD = "swift_theme.api.desk_overview.get_overview";

export class OverviewDashboard {
    constructor($parent, state) {
        this.state = state;
        this.has_erpnext = "erpnext" in (frappe.boot.versions || {});
        this.pending_calls = 0;
        set_sod_style();
        this.make_layout($parent);
        this.make_filters();
        this.refresh();
    }

    make_layout($parent) {
        this.$body = $(`
            <div class="zsd-main">
                <header class="zsd-header">
                    <div class="zsd-heading">
                        <h4 class="zsd-title">${__("Business Overview")}</h4>
                        <div class="zsd-subtitle"></div>
                    </div>
                    <div class="zsd-filters"></div>
                    <button class="btn btn-default btn-sm zsd-refresh" title="${__("Refresh")}"
                        aria-label="${__("Refresh")}">${zsd_glyph("refresh", 14)}</button>
                </header>
                <div class="zsd-cards sod-cards"></div>
                <div class="zsd-panels">
                    <section class="zsd-panel sod-overdue"></section>
                    <section class="zsd-panel sod-todos"></section>
                </div>
            </div>
        `).appendTo($parent);

        this.$body.on("click", ".zsd-refresh", () => this.refresh());
        this.$body.on("click", "[data-kpi]", (e) => {
            const kpi = this.data.kpis.find((k) => k.key === $(e.currentTarget).attr("data-kpi"));
            const company = this.get_args().company;
            frappe.route_options = { ...kpi.route_filters, ...(company ? { company } : {}) };
            frappe.set_route("List", kpi.doctype);
        });
    }

    make_filters() {
        const $filters = this.$body.find(".zsd-filters");
        const make = (df) => {
            const control = frappe.ui.form.make_control({
                df: {
                    ...df,
                    change: () => {
                        this.state[df.fieldname] = control.get_value();
                        this.refresh();
                    },
                },
                parent: $(`<div class="zsd-filter zsd-filter-${df.fieldname}"></div>`).appendTo($filters),
                render_input: true,
            });
            control.set_value(this.state[df.fieldname] ?? df.default ?? "");
            control.$wrapper.find(".control-label").remove();
            return control;
        };

        // Without ERPNext there is no Company doctype, and nothing on the dashboard depends on dates either
        if (!this.has_erpnext) return;
        this.company = make({
            fieldname: "company", fieldtype: "Link", options: "Company", placeholder: __("All Companies"),
        });
        this.from_date = make({
            fieldname: "from_date", fieldtype: "Date", placeholder: __("From Date"),
            default: frappe.datetime.month_start(),
        });
        this.to_date = make({
            fieldname: "to_date", fieldtype: "Date", placeholder: __("To Date"), default: frappe.datetime.get_today(),
        });
    }

    get_args() {
        const today = frappe.datetime.get_today();
        return {
            company: this.company?.get_value() || null,
            from_date: this.from_date?.get_value() || frappe.datetime.month_start(),
            to_date: this.to_date?.get_value() || today,
        };
    }

    refresh() {
        const args = this.get_args();
        this.pending_calls++;
        this.$body.addClass("is-loading");
        if (!this.data && this.has_erpnext) {
            this.$body.find(".sod-cards").html(`<div class="zsd-card zsd-skeleton"></div>`.repeat(4));
        }
        frappe.call({ method: SOD_METHOD, args })
            .then((r) => {
                this.data = r.message;
                this.render_subtitle();
                this.render_cards();
                this.render_overdue();
                this.render_todos();
            })
            .always(() => {
                if (--this.pending_calls === 0) this.$body.removeClass("is-loading");
            });
    }

    render_subtitle() {
        const updated = __("Updated {0}", [moment().format("HH:mm")]);
        if (!this.has_erpnext) {
            this.$body.find(".zsd-subtitle").text(updated);
            return;
        }
        const args = this.get_args();
        const range = `${frappe.datetime.str_to_user(args.from_date)} – ${frappe.datetime.str_to_user(args.to_date)}`;
        this.$body.find(".zsd-subtitle").text(`${args.company || __("All Companies")} · ${range} · ${updated}`);
    }

    render_cards() {
        const cards = this.data.kpis.map((k) => `
            <button class="zsd-card zsd-c-${k.color}" data-kpi="${k.key}">
                <span class="zsd-card-top">
                    <span class="zsd-chip">${zsd_glyph(k.glyph, 15)}</span>
                    <span class="zsd-card-share">${format_number(k.count, null, 0)}</span>
                </span>
                <span class="zsd-card-count">${format_currency(k.value, this.data.currency, 0)}</span>
                <span class="zsd-card-label">${k.label}</span>
                <span class="zsd-card-hint">${k.hint}</span>
            </button>`);
        this.$body.find(".sod-cards").toggleClass("hide", !cards.length).html(cards.join(""));
    }

    render_overdue() {
        const $panel = this.$body.find(".sod-overdue");
        const overdue = this.data.overdue;
        $panel.toggleClass("hide", !overdue);
        if (!overdue) return;

        const esc = frappe.utils.escape_html;
        const rows = overdue.rows.map((inv) => `
            <li><a class="zsd-issue zsd-c-red" href="${frappe.utils.get_form_link("Sales Invoice", inv.name)}">
                <span class="zsd-issue-mark"></span>
                <span class="zsd-issue-title">
                    <span class="zsd-ellipsis">${esc(inv.customer_name || inv.name)}</span>
                    <span class="zsd-muted">${esc(inv.name)} · ${__("Due {0}", [frappe.datetime.str_to_user(inv.due_date)])}</span>
                </span>
                <span class="zsd-issue-count">${format_currency(inv.outstanding_amount, inv.currency)}</span>
            </a></li>`);

        const more = overdue.has_more ? `<a class="zsd-footnote sod-link" role="button">${__("View all")}</a>` : "";
        $panel.html(`
            ${panel_head("alert", __("Overdue Sales Invoices"), overdue.rows.length + (overdue.has_more ? "+" : ""))}
            ${rows.length ? `<ul class="zsd-issue-list">${rows.join("")}</ul>${more}`
                : empty_state("check", __("Nothing overdue"), __("Every sales invoice past its due date is paid."))}
        `);
        $panel.find(".sod-link").on("click", () => {
            const company = this.get_args().company;
            frappe.route_options = {
                docstatus: 1,
                outstanding_amount: [">", 0],
                due_date: ["<", frappe.datetime.get_today()],
                ...(company ? { company } : {}),
            };
            frappe.set_route("List", "Sales Invoice");
        });
    }

    render_todos() {
        const esc = frappe.utils.escape_html;
        const tone = { High: "red", Medium: "orange", Low: "gray" };
        const rows = this.data.todos.map((t) => {
            const href = t.reference_type && t.reference_name
                ? frappe.utils.get_form_link(t.reference_type, t.reference_name)
                : frappe.utils.get_form_link("ToDo", t.name);
            const text = frappe.utils.html2text(t.description || "").trim() || t.name;
            const meta = [t.reference_type && `${__(t.reference_type)} ${t.reference_name}`,
                t.date && __("Due {0}", [frappe.datetime.str_to_user(t.date)])].filter(Boolean).join(" · ");
            return `<li><a class="zsd-issue zsd-c-${tone[t.priority] || "gray"}" href="${href}">
                <span class="zsd-issue-mark"></span>
                <span class="zsd-issue-title">
                    <span class="zsd-ellipsis" title="${esc(text)}">${esc(text)}</span>
                    ${meta ? `<span class="zsd-muted">${esc(meta)}</span>` : ""}
                </span>
                <span class="zsd-issue-go">${zsd_glyph("chevron", 14)}</span>
            </a></li>`;
        });

        const $panel = this.$body.find(".sod-todos");
        // Alone on the row when there is no overdue panel beside it
        $panel.toggleClass("sod-wide", !this.data.overdue);
        $panel.html(`
            ${panel_head("list", __("My Open ToDos"), rows.length)}
            ${rows.length ? `<ul class="zsd-issue-list">${rows.join("")}</ul>
                <a class="zsd-footnote sod-link" href="/app/todo?status=Open&allocated_to=${encodeURIComponent(frappe.session.user)}">
                    ${__("View all")}</a>`
                : empty_state("check", __("All caught up"), __("Nothing is assigned to you right now."))}
        `);
    }
}

function panel_head(glyph, title, count) {
    return `<div class="zsd-panel-head">
        <span class="zsd-panel-icon">${zsd_glyph(glyph, 14)}</span>
        <h6 class="zsd-panel-title">${title}</h6>
        ${count ? `<span class="zsd-count-badge">${count}</span>` : ""}
    </div>`;
}

function empty_state(glyph, title, text) {
    return `<div class="zsd-empty">
        <span class="zsd-empty-icon">${zsd_glyph(glyph, 18)}</span>
        <div class="zsd-empty-title">${title}</div>
        <div class="zsd-empty-text">${text}</div>
    </div>`;
}

let sod_style_set = false;

function set_sod_style() {
    set_zsd_style();
    if (sod_style_set) return;
    sod_style_set = true;

    frappe.dom.set_style(`
        .zsd-cards.sod-cards { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
        .sod-cards .zsd-card { cursor: pointer; }
        .sod-cards .zsd-card-count { font-size: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .zsd-panel.sod-wide { grid-column: 1 / -1; }
        .sod-overdue .zsd-issue-title, .sod-todos .zsd-issue-title {
            display: flex; flex-direction: column; min-width: 0; gap: 1px;
        }
        a.sod-link { display: inline-block; margin-top: 8px; color: var(--zsd-accent); cursor: pointer; }
    `);
}
