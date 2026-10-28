// ZATCA submission status dashboard, shown on the desk page (/desk) when KSA Compliance is installed.
//
// swift-desk-dashboard.js decides which dashboard the desk shows and splits the page for it; this module only draws
// the ZATCA one. set_zsd_style() also carries the split and the shared card/panel styles, which the overview
// dashboard reuses.
//
// Colours, radii and shadows come from the desk's tokens (and Swift Theme's), so the dashboard follows the active
// theme and dark mode without rules of its own.

const ZSD_METHOD = "swift_theme.api.zatca_status_dashboard";

// Small inline glyphs, so the dashboard doesn't depend on which icon names the active sprite ships
const ZSD_GLYPHS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    bars: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    // Used by the overview dashboard
    up: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    down: '<path d="m3 7 6 6 4-4 8 8"/><path d="M14 17h7v-7"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    outbox: '<path d="M12 3v10M8 7l4-4 4 4"/><path d="M22 14h-6l-2 3h-4l-2-3H2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
};

export function zsd_glyph(name, size = 16) {
    return `<svg class="zsd-glyph" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true">${ZSD_GLYPHS[name]}</svg>`;
}

const ZSD_GROUPS = {
    accepted: { label: __("Accepted"), color: "green", glyph: "check", hint: __("Cleared or reported") },
    warnings: { label: __("Accepted with Warnings"), color: "yellow", glyph: "alert", hint: __("Fix to avoid rejections") },
    rejected: { label: __("Rejected"), color: "red", glyph: "x", hint: __("Needs correction") },
    delayed: { label: __("Delayed"), color: "orange", glyph: "clock", hint: __("Awaiting retry") },
    not_posted: { label: __("Not Posted"), color: "gray", glyph: "upload", hint: __("Not sent yet") },
    // Drill-downs reachable from the issues panel
    overdue: { label: __("Past Deadline"), color: "red", glyph: "alert" },
    approaching: { label: __("Approaching Deadline"), color: "orange", glyph: "clock" },
    local_validation: { label: __("Failed Local Validation"), color: "orange", glyph: "alert" },
};

const ZSD_MAIN_GROUPS = ["accepted", "warnings", "rejected", "delayed", "not_posted"];
const ZSD_PENDING_GROUPS = ["delayed", "not_posted", "overdue", "approaching", "local_validation"];

const ZSD_STATUS_COLORS = {
    "Accepted": "green",
    "Accepted with warnings": "yellow",
    "Clearance switched off": "blue",
    "Duplicate": "gray",
    "Rejected": "red",
    "Resend": "orange",
    "Ready For Batch": "gray",
    "Corrected": "gray",
};

const ZSD_HEALTH = {
    "Healthy": { color: "green", glyph: "shield", text: __("All submissions are on track.") },
    "Needs Attention": { color: "orange", glyph: "alert", text: __("Some invoices need action soon.") },
    "Critical": { color: "red", glyph: "alert", text: __("Invoices are past the reporting deadline.") },
};

export class ZatcaStatusDashboard {
    constructor($parent, state) {
        this.state = state;
        this.state.group = this.state.group || "rejected";
        this.pending_calls = 0;
        this.make_layout($parent);
        this.make_filters();
        this.refresh();
    }

    make_layout($parent) {
        this.$body = $(`
            <div class="zsd-main">
                <header class="zsd-header">
                    <div class="zsd-heading">
                        <h4 class="zsd-title">${__("ZATCA Submission Status")}</h4>
                        <div class="zsd-subtitle"></div>
                    </div>
                    <div class="zsd-filters"></div>
                    <button class="btn btn-default btn-sm zsd-refresh" title="${__("Refresh")}"
                        aria-label="${__("Refresh")}">${zsd_glyph("refresh", 14)}</button>
                </header>
                <section class="zsd-hero"></section>
                <div class="zsd-cards"></div>
                <div class="zsd-panels">
                    <section class="zsd-panel zsd-issues"></section>
                    <section class="zsd-panel zsd-patterns"></section>
                </div>
                <section class="zsd-panel zsd-list"></section>
            </div>
        `).appendTo($parent);

        this.$body.on("click", ".zsd-refresh", () => this.refresh());
        this.$body.on("click", "[data-group]", (e) => {
            this.state.group = $(e.currentTarget).attr("data-group");
            this.render_cards();
            this.load_invoices();
            if (!$(e.currentTarget).hasClass("zsd-card")) {
                this.$body.find(".zsd-list")[0].scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
        this.$body.on("click", ".zsd-more", () => this.load_invoices(true));
        this.$body.on("click", ".zsd-toggle", (e) => {
            const $row = $(e.currentTarget).closest("tr");
            $row.toggleClass("is-open").next(".zsd-detail-row").toggleClass("hide");
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

        this.company = make({
            fieldname: "company", fieldtype: "Link", options: "Company", placeholder: __("All Companies"),
        });
        this.from_date = make({
            fieldname: "from_date", fieldtype: "Date", placeholder: __("From Date"),
            default: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
        });
        this.to_date = make({
            fieldname: "to_date", fieldtype: "Date", placeholder: __("To Date"), default: frappe.datetime.get_today(),
        });
    }

    get_args() {
        return {
            company: this.company.get_value() || null,
            from_date: this.from_date.get_value(),
            to_date: this.to_date.get_value(),
        };
    }

    call(method, args) {
        this.pending_calls++;
        this.$body.addClass("is-loading");
        // frappe.call returns a jQuery jqXHR, which has always() but not finally()
        return frappe.call({ method: `${ZSD_METHOD}.${method}`, args }).always(() => {
            if (--this.pending_calls === 0) this.$body.removeClass("is-loading");
        });
    }

    refresh() {
        const args = this.get_args();
        if (!args.from_date || !args.to_date) return;

        if (!this.data) this.render_placeholders();
        this.call("get_dashboard_data", args).then((r) => {
            this.data = r.message;
            this.render_subtitle();
            this.render_hero();
            this.render_cards();
            this.render_issues();
            this.render_patterns();
        });
        this.load_invoices();
    }

    render_placeholders() {
        const skeleton = `<div class="zsd-skeleton"></div>`;
        this.$body.find(".zsd-hero").html(skeleton);
        this.$body.find(".zsd-cards").html(ZSD_MAIN_GROUPS.map(() => `<div class="zsd-card zsd-skeleton"></div>`).join(""));
    }

    render_subtitle() {
        const args = this.get_args();
        const range = `${frappe.datetime.str_to_user(args.from_date)} – ${frappe.datetime.str_to_user(args.to_date)}`;
        const updated = __("Updated {0}", [moment().format("HH:mm")]);
        this.$body.find(".zsd-subtitle").text(`${args.company || __("All Companies")} · ${range} · ${updated}`);
    }

    render_hero() {
        const s = this.data.summary;
        const groups = this.data.groups;
        const health = ZSD_HEALTH[s.health];
        const pct = (v) => (v === null || v === undefined ? "—" : `${v}<small>%</small>`);

        const segments = s.total
            ? ZSD_MAIN_GROUPS.filter((key) => groups[key]).map((key) => `
                <span class="zsd-seg zsd-c-${ZSD_GROUPS[key].color}" style="flex-grow: ${groups[key]}"
                    title="${ZSD_GROUPS[key].label}: ${groups[key]}"></span>`).join("")
            : `<span class="zsd-seg zsd-seg-empty"></span>`;

        const legend = ZSD_MAIN_GROUPS.map((key) => `
            <span class="zsd-legend-item">
                <span class="zsd-dot zsd-c-${ZSD_GROUPS[key].color}"></span>${ZSD_GROUPS[key].label}
                <b>${format_number(groups[key], null, 0)}</b>
            </span>`).join("");

        const stat = (label, value, hint, tone = "") => `
            <div class="zsd-stat ${tone}">
                <div class="zsd-stat-label">${label}</div>
                <div class="zsd-stat-value">${value}</div>
                <div class="zsd-stat-hint">${hint}</div>
            </div>`;

        this.$body.find(".zsd-hero").attr("class", `zsd-hero zsd-c-${health.color}`).html(`
            <div class="zsd-hero-top">
                <div class="zsd-hero-badge">${zsd_glyph(health.glyph, 20)}</div>
                <div class="zsd-hero-text">
                    <div class="zsd-hero-status">${__(s.health)}</div>
                    <div class="zsd-hero-desc">${health.text}</div>
                </div>
                <div class="zsd-hero-total">
                    <div class="zsd-hero-total-value">${format_number(s.total, null, 0)}</div>
                    <div class="zsd-hero-total-label">${__("Invoices")}</div>
                </div>
            </div>
            <div class="zsd-distribution">${segments}</div>
            <div class="zsd-legend">${legend}</div>
            <div class="zsd-stats">
                ${stat(__("Submission Rate"), pct(s.submission_rate), __("Reached ZATCA"))}
                ${stat(__("Acceptance Rate"), pct(s.acceptance_rate), __("Of invoices sent"))}
                ${stat(__("Past Deadline"), s.overdue, __("Pending over {0}h", [this.data.reporting_window_hours]),
                    s.overdue ? "is-red" : "")}
                ${stat(__("Near Deadline"), s.approaching, __("Act today"), s.approaching ? "is-orange" : "")}
            </div>
        `);
    }

    render_cards() {
        if (!this.data) return;
        const total = this.data.summary.total;
        const cards = ZSD_MAIN_GROUPS.map((key) => {
            const g = ZSD_GROUPS[key];
            const count = this.data.groups[key];
            const share = total ? Math.round((count * 100) / total) : 0;
            return `
                <button class="zsd-card zsd-c-${g.color} ${this.state.group === key ? "active" : ""}"
                    data-group="${key}" aria-pressed="${this.state.group === key}">
                    <span class="zsd-card-top">
                        <span class="zsd-chip">${zsd_glyph(g.glyph, 15)}</span>
                        <span class="zsd-card-share">${share}%</span>
                    </span>
                    <span class="zsd-card-count">${format_number(count, null, 0)}</span>
                    <span class="zsd-card-label">${g.label}</span>
                    <span class="zsd-card-hint">${g.hint}</span>
                </button>`;
        });
        this.$body.find(".zsd-cards").html(cards.join(""));
    }

    render_issues() {
        const issues = this.data.issues;
        const rows = issues.map((issue) => {
            const tone = `zsd-c-${issue.severity}`;
            const title = frappe.utils.escape_html(issue.title);
            const tail = issue.count !== undefined
                ? `<span class="zsd-issue-count">${format_number(issue.count, null, 0)}</span>`
                : `<span class="zsd-issue-go">${zsd_glyph("chevron", 14)}</span>`;
            const attrs = issue.group
                ? `data-group="${issue.group}" role="button"`
                : `href="${frappe.utils.get_form_link(issue.doctype, issue.name)}"`;
            return `<li><a class="zsd-issue ${tone}" ${attrs}>
                <span class="zsd-issue-mark"></span><span class="zsd-issue-title">${title}</span>${tail}</a></li>`;
        });

        this.$body.find(".zsd-issues").html(`
            ${this.panel_head("alert", __("Compliance Issues"), issues.length)}
            ${rows.length ? `<ul class="zsd-issue-list">${rows.join("")}</ul>`
                : this.empty_state("shield", __("No open issues"), __("Everything in this period is compliant."))}
        `);
    }

    render_patterns() {
        const esc = frappe.utils.escape_html;
        const patterns = this.data.error_patterns;
        const max = patterns.length ? patterns[0].count : 1;
        const rows = patterns.map((p) => `
            <li class="zsd-pattern">
                <div class="zsd-pattern-top">
                    <span class="zsd-code zsd-c-${p.type === "error" ? "red" : "yellow"}">${esc(p.code)}</span>
                    <span class="zsd-pattern-count">${p.count}</span>
                </div>
                <div class="zsd-pattern-msg" title="${esc(p.message)}">${esc(p.message)}</div>
                <div class="zsd-bar zsd-c-${p.type === "error" ? "red" : "yellow"}">
                    <span style="width: ${Math.max((p.count / max) * 100, 4)}%"></span>
                </div>
            </li>`);

        this.$body.find(".zsd-patterns").html(`
            ${this.panel_head("bars", __("Recurring Errors"), patterns.length)}
            ${rows.length ? `<ul class="zsd-pattern-list">${rows.join("")}</ul>
                <div class="zsd-footnote">${__("Counted by invoices affected")}</div>`
                : this.empty_state("check", __("No recurring errors"), __("ZATCA reported no errors in this period."))}
        `);
    }

    panel_head(glyph, title, count) {
        return `<div class="zsd-panel-head">
            <span class="zsd-panel-icon">${zsd_glyph(glyph, 14)}</span>
            <h6 class="zsd-panel-title">${title}</h6>
            ${count ? `<span class="zsd-count-badge">${count}</span>` : ""}
        </div>`;
    }

    empty_state(glyph, title, text) {
        return `<div class="zsd-empty">
            <span class="zsd-empty-icon">${zsd_glyph(glyph, 18)}</span>
            <div class="zsd-empty-title">${title}</div>
            <div class="zsd-empty-text">${text}</div>
        </div>`;
    }

    load_invoices(append = false) {
        const args = this.get_args();
        if (!args.from_date || !args.to_date) return;

        const group = this.state.group;
        args.group = group;
        args.start = append ? this.next_start : 0;
        this.call("get_invoices", args).then((r) => {
            // Ignore stale responses if the user switched groups mid-request
            if (group !== this.state.group) return;
            this.next_start = r.message.next_start;
            this.render_invoices(r.message, append);
        });
    }

    render_invoices({ invoices, has_more }, append) {
        const $list = this.$body.find(".zsd-list");
        const pending = ZSD_PENDING_GROUPS.includes(this.state.group);

        if (!append) {
            const g = ZSD_GROUPS[this.state.group];
            $list.attr("class", `zsd-panel zsd-list zsd-c-${g.color}`).html(`
                <div class="zsd-panel-head">
                    <span class="zsd-panel-icon zsd-tinted">${zsd_glyph(g.glyph, 14)}</span>
                    <h6 class="zsd-panel-title">${g.label}</h6>
                    <span class="zsd-panel-sub">${pending
                        ? __("Oldest first · deadline {0}h", [this.data ? this.data.reporting_window_hours : 24])
                        : __("Newest first")}</span>
                </div>
                <div class="zsd-table-wrap">
                    <table class="zsd-table">
                        <thead><tr>
                            <th>${__("Invoice")}</th>
                            <th>${__("Date")}</th>
                            <th>${__("Customer")}</th>
                            <th class="text-right">${__("Amount")}</th>
                            <th>${__("Status")}</th>
                            <th>${pending ? __("Pending") : __("Reason")}</th>
                        </tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div class="zsd-list-footer"></div>
            `);
        }

        const $tbody = $list.find("tbody");
        $tbody.append(invoices.map((inv) => this.invoice_row(inv, pending)).join(""));
        if (!$tbody.children().length) {
            $tbody.html(`<tr class="zsd-empty-row"><td colspan="6">
                ${this.empty_state("check", __("Nothing here"), __("No invoices in this group for the selected period."))}
            </td></tr>`);
        }
        $list.find(".zsd-list-footer").html(has_more
            ? `<button class="btn btn-default btn-sm zsd-more">${__("Load more")}</button>` : "");
    }

    invoice_row(inv, pending) {
        const esc = frappe.utils.escape_html;
        const siaf_link = frappe.utils.get_form_link("Sales Invoice Additional Fields", inv.siaf);
        const issues = [
            ...inv.errors.map((e) => ({ ...e, tone: "red" })),
            ...inv.local_errors.map((e) => ({ ...e, tone: "orange" })),
            ...inv.warnings.map((e) => ({ ...e, tone: "yellow" })),
        ];
        const is_rejected = inv.status === "Rejected";

        let reason = inv.reason ? `<div class="zsd-reason">${esc(inv.reason)}</div>` : "";
        if (pending) {
            const flag = inv.deadline === "overdue"
                ? `<span class="zsd-flag zsd-c-red">${__("Past deadline")}</span>`
                : inv.deadline === "approaching"
                    ? `<span class="zsd-flag zsd-c-orange">${__("Near deadline")}</span>` : "";
            reason = `<div class="zsd-age"><b>${format_zsd_age(inv.pending_hours)}</b>${flag}</div>${reason}`;
        }
        if (issues.length) {
            reason += `<a class="zsd-toggle" role="button">${zsd_glyph("chevron", 12)}
                ${__("{0} issue(s)", [issues.length])}</a>`;
        }

        const detail = issues.length ? `
            <tr class="zsd-detail-row ${is_rejected ? "" : "hide"}">
                <td colspan="6">
                    <ul class="zsd-errors">
                        ${issues.map((e) => `
                            <li class="zsd-c-${e.tone}">
                                ${e.code && e.code !== "No Code" ? `<span class="zsd-code">${esc(e.code)}</span>` : ""}
                                <span class="zsd-error-msg">${esc(e.message)}</span>
                                ${e.category && e.category !== "No Category"
                                    ? `<span class="zsd-error-cat">${esc(e.category)}</span>` : ""}
                            </li>`).join("")}
                    </ul>
                    ${is_rejected ? `<div class="zsd-fix-hint">
                        ${__("Correct the source data, then use Fix Rejection on")}
                        <a href="${siaf_link}">${esc(inv.siaf)}</a>
                    </div>` : ""}
                </td>
            </tr>` : "";

        return `
            <tr class="${is_rejected && issues.length ? "is-open" : ""}">
                <td class="zsd-nowrap">
                    <a class="zsd-inv-link" href="${frappe.utils.get_form_link(inv.invoice_doctype, inv.invoice)}">
                        ${esc(inv.invoice)}</a>
                    <div class="zsd-muted">${__(inv.invoice_type)}</div>
                </td>
                <td class="zsd-nowrap">${inv.posting_date ? frappe.datetime.str_to_user(inv.posting_date) : ""}</td>
                <td><div class="zsd-ellipsis" title="${esc(inv.customer || "")}">${esc(inv.customer || "")}</div></td>
                <td class="text-right zsd-nowrap zsd-amount">${format_currency(inv.amount, inv.currency)}</td>
                <td class="zsd-nowrap">
                    <a href="${siaf_link}" class="zsd-status zsd-c-${ZSD_STATUS_COLORS[inv.status] || "gray"}">
                        <span class="zsd-dot"></span>${__(inv.status)}</a>
                </td>
                <td class="zsd-reason-cell">${reason}</td>
            </tr>
            ${detail}`;
    }
}

function format_zsd_age(hours) {
    if (hours === null || hours === undefined) return "";
    if (hours < 1) return __("{0}m", [Math.round(hours * 60)]);
    if (hours < 48) return __("{0}h", [Math.floor(hours)]);
    return __("{0}d {1}h", [Math.floor(hours / 24), Math.floor(hours % 24)]);
}

let zsd_style_set = false;

export function set_zsd_style() {
    if (zsd_style_set) return;
    zsd_style_set = true;

    frappe.dom.set_style(`
        /* ---- tokens: Swift Theme's when present, the desk's otherwise ---- */
        .zsd-desk-split {
            --zsd-surface: var(--swift-home-surface, var(--card-bg, var(--fg-color)));
            --zsd-surface-2: var(--subtle-fg, var(--control-bg));
            --zsd-border: var(--swift-home-border, var(--border-color));
            --zsd-ink: var(--swift-home-ink, var(--heading-color, var(--text-color)));
            --zsd-text: var(--text-color);
            --zsd-muted: var(--swift-home-muted, var(--text-muted));
            --zsd-accent: var(--swift-home-accent, var(--swift-accent, var(--primary)));
            --zsd-radius: var(--swift-radius-lg, 12px);
            --zsd-radius-sm: var(--swift-radius-sm, 8px);
            --zsd-shadow: var(--swift-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
            --zsd-shadow-hover: var(--swift-shadow-md, 0 6px 16px rgba(0, 0, 0, 0.08));
        }
        .zsd-c-green  { --zsd-c: var(--green-500, #10b981); }
        .zsd-c-red    { --zsd-c: var(--red-500, #ef4444); }
        .zsd-c-orange { --zsd-c: var(--orange-500, #f97316); }
        .zsd-c-yellow { --zsd-c: var(--yellow-500, #eab308); }
        .zsd-c-blue   { --zsd-c: var(--blue-500, #3b82f6); }
        .zsd-c-gray   { --zsd-c: var(--gray-500, #6b7280); }

        /* ---- desk split: icons in the left third, dashboard in the right two thirds ---- */
        body.desktop-page .desktop-container.zsd-desk-split {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
            align-items: start;
            gap: 24px;
            max-width: 1680px;
            margin: 0 auto;
            padding: 24px;
        }
        body.desktop-page .zsd-desk-split > .zsd-apps-panel {
            position: sticky;
            top: calc(var(--desktop-navbar-height, 56px) + 24px);
            margin: 0;
            padding: 16px;
            border: 1px solid var(--zsd-border);
            border-radius: var(--zsd-radius);
            background: var(--zsd-surface);
            box-shadow: var(--zsd-shadow);
            max-height: calc(100vh - var(--desktop-navbar-height, 56px) - 48px);
            overflow-y: auto;
        }
        body.desktop-page .zsd-apps-head {
            display: flex; align-items: center; gap: 8px;
            padding: 0 4px 12px; margin-bottom: 8px;
            border-bottom: 1px solid var(--zsd-border);
            color: var(--zsd-muted);
            font-size: var(--text-sm); font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase;
        }
        body.desktop-page .zsd-desk-split > .zsd-apps-panel > .icons {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            grid-template-rows: none;
            gap: 4px;
        }
        body.desktop-page .zsd-desk-split > .zsd-apps-panel > .icons > .desktop-icon {
            width: 100%;
            height: auto;
            padding: 12px 4px 10px;
            border-radius: var(--zsd-radius-sm);
            transition: background-color 0.15s ease;
        }
        body.desktop-page .zsd-desk-split > .zsd-apps-panel > .icons > .desktop-icon:hover {
            background: var(--zsd-surface-2);
        }
        body.desktop-page .zsd-desk-split > .zsd-apps-panel .icon-title {
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        body.desktop-page .zsd-desk-pane { min-width: 0; }
        @media (max-width: 1199px) {
            body.desktop-page .zsd-desk-split > .zsd-apps-panel > .icons {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
        }
        @media (max-width: 991px) {
            body.desktop-page .desktop-container.zsd-desk-split { grid-template-columns: minmax(0, 1fr); padding: 16px; }
            body.desktop-page .zsd-desk-split > .zsd-apps-panel { position: static; max-height: none; }
            body.desktop-page .zsd-desk-split > .zsd-apps-panel > .icons {
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)) !important;
            }
        }

        /* ---- dashboard ---- */
        .zsd-main { display: flex; flex-direction: column; gap: 16px; transition: opacity 0.2s ease; }
        .zsd-main.is-loading .zsd-hero, .zsd-main.is-loading .zsd-cards,
        .zsd-main.is-loading .zsd-panels, .zsd-main.is-loading .zsd-list { opacity: 0.6; }
        .zsd-main.is-loading .zsd-refresh .zsd-glyph { animation: zsd-spin 0.9s linear infinite; }
        @keyframes zsd-spin { to { transform: rotate(360deg); } }
        .zsd-glyph { flex: none; display: block; }

        .zsd-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .zsd-heading { margin-right: auto; min-width: 0; }
        .zsd-title { margin: 0; font-size: var(--text-xl); font-weight: 600; color: var(--zsd-ink); letter-spacing: -0.01em; }
        .zsd-subtitle { margin-top: 2px; font-size: var(--text-sm); color: var(--zsd-muted); }
        .zsd-filters { display: flex; gap: 8px; flex-wrap: wrap; }
        .zsd-filter { width: 140px; }
        .zsd-filter-company { width: 180px; }
        .zsd-filter .frappe-control { margin-bottom: 0; }
        .zsd-refresh { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; }

        .zsd-hero, .zsd-panel {
            border: 1px solid var(--zsd-border);
            border-radius: var(--zsd-radius);
            background: var(--zsd-surface);
            box-shadow: var(--zsd-shadow);
        }
        .zsd-hero {
            position: relative;
            overflow: hidden;
            padding: 20px 20px 16px;
            background:
                linear-gradient(135deg, color-mix(in srgb, var(--zsd-c, var(--zsd-accent)) 9%, transparent), transparent 55%),
                var(--zsd-surface);
        }
        .zsd-hero::before {
            content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--zsd-c, var(--zsd-accent));
        }
        .zsd-hero-top { display: flex; align-items: center; gap: 14px; }
        .zsd-hero-badge {
            display: flex; align-items: center; justify-content: center;
            width: 42px; height: 42px; border-radius: 50%;
            color: var(--zsd-c);
            background: color-mix(in srgb, var(--zsd-c) 15%, transparent);
        }
        .zsd-hero-text { flex: 1; min-width: 0; }
        .zsd-hero-status { font-size: var(--text-lg); font-weight: 600; color: var(--zsd-ink); }
        .zsd-hero-desc { font-size: var(--text-sm); color: var(--zsd-muted); }
        .zsd-hero-total { text-align: right; }
        .zsd-hero-total-value { font-size: 28px; font-weight: 700; line-height: 1.1; color: var(--zsd-ink); font-variant-numeric: tabular-nums; }
        .zsd-hero-total-label { font-size: var(--text-xs); color: var(--zsd-muted); text-transform: uppercase; letter-spacing: 0.04em; }

        .zsd-distribution {
            display: flex; gap: 2px; height: 10px; margin: 18px 0 10px;
            border-radius: 999px; overflow: hidden; background: var(--zsd-surface-2);
        }
        .zsd-seg { flex-basis: 0; min-width: 4px; background: var(--zsd-c); transition: flex-grow 0.4s ease; }
        .zsd-seg-empty { flex-grow: 1; background: transparent; }
        .zsd-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: var(--text-sm); color: var(--zsd-muted); }
        .zsd-legend-item { display: inline-flex; align-items: center; gap: 6px; }
        .zsd-legend-item b { color: var(--zsd-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
        .zsd-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--zsd-c); flex: none; }

        .zsd-stats {
            display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
            margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--zsd-border);
        }
        .zsd-stat { padding: 0 14px; border-left: 1px solid var(--zsd-border); }
        .zsd-stat:first-child { padding-left: 0; border-left: none; }
        .zsd-stat-label { font-size: var(--text-xs); color: var(--zsd-muted); font-weight: 500; }
        .zsd-stat-value { margin: 2px 0; font-size: 22px; font-weight: 600; color: var(--zsd-ink); font-variant-numeric: tabular-nums; }
        .zsd-stat-value small { font-size: 0.6em; font-weight: 500; color: var(--zsd-muted); margin-left: 1px; }
        .zsd-stat.is-red .zsd-stat-value { color: var(--red-600, #dc2626); }
        .zsd-stat.is-orange .zsd-stat-value { color: var(--orange-600, #ea580c); }
        .zsd-stat-hint { font-size: var(--text-xs); color: var(--zsd-muted); }

        .zsd-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
        .zsd-card {
            position: relative;
            display: flex; flex-direction: column; align-items: stretch; gap: 2px;
            min-height: 120px;
            padding: 14px 16px;
            border: 1px solid var(--zsd-border);
            border-radius: var(--zsd-radius);
            background: var(--zsd-surface);
            box-shadow: var(--zsd-shadow);
            color: var(--zsd-text);
            text-align: left;
            transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, background-color 0.15s ease;
        }
        .zsd-card:hover { transform: translateY(-1px); box-shadow: var(--zsd-shadow-hover); border-color: color-mix(in srgb, var(--zsd-c) 45%, var(--zsd-border)); }
        .zsd-card:focus-visible { outline: 2px solid var(--zsd-c); outline-offset: 2px; }
        .zsd-card.active {
            border-color: var(--zsd-c);
            background: color-mix(in srgb, var(--zsd-c) 7%, var(--zsd-surface));
            box-shadow: 0 0 0 1px var(--zsd-c), var(--zsd-shadow-hover);
        }
        .zsd-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .zsd-chip {
            display: flex; align-items: center; justify-content: center;
            width: 30px; height: 30px; border-radius: var(--zsd-radius-sm);
            color: var(--zsd-c); background: color-mix(in srgb, var(--zsd-c) 14%, transparent);
        }
        .zsd-card-share {
            padding: 1px 8px; border-radius: 999px;
            font-size: var(--text-xs); font-weight: 500; color: var(--zsd-muted); background: var(--zsd-surface-2);
        }
        .zsd-card-count { font-size: 26px; font-weight: 700; line-height: 1.15; color: var(--zsd-ink); font-variant-numeric: tabular-nums; }
        .zsd-card-label { font-size: var(--text-md); font-weight: 600; color: var(--zsd-ink); }
        .zsd-card-hint { font-size: var(--text-xs); color: var(--zsd-muted); }

        .zsd-panels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .zsd-panel { padding: 16px; min-width: 0; }
        .zsd-panel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .zsd-panel-icon {
            display: flex; align-items: center; justify-content: center;
            width: 24px; height: 24px; border-radius: 6px;
            color: var(--zsd-muted); background: var(--zsd-surface-2);
        }
        .zsd-panel-icon.zsd-tinted { color: var(--zsd-c); background: color-mix(in srgb, var(--zsd-c) 14%, transparent); }
        .zsd-panel-title { margin: 0; font-size: var(--text-md); font-weight: 600; color: var(--zsd-ink); }
        .zsd-panel-sub { margin-left: auto; font-size: var(--text-xs); color: var(--zsd-muted); }
        .zsd-count-badge {
            padding: 0 7px; border-radius: 999px; line-height: 18px;
            font-size: var(--text-xs); font-weight: 600; color: var(--zsd-muted); background: var(--zsd-surface-2);
        }

        .zsd-issue-list, .zsd-pattern-list, .zsd-errors { list-style: none; padding: 0; margin: 0; }
        .zsd-issue {
            display: flex; align-items: center; gap: 10px;
            margin: 0 -8px; padding: 9px 8px;
            border-radius: var(--zsd-radius-sm);
            color: var(--zsd-text) !important; cursor: pointer;
            transition: background-color 0.15s ease;
        }
        .zsd-issue-list li + li .zsd-issue { border-top: 1px solid var(--zsd-border); border-radius: 0; }
        .zsd-issue:hover { text-decoration: none; background: var(--zsd-surface-2); border-radius: var(--zsd-radius-sm); }
        .zsd-issue-mark { width: 3px; align-self: stretch; min-height: 18px; border-radius: 3px; background: var(--zsd-c); flex: none; }
        .zsd-issue-title { flex: 1; font-size: var(--text-sm); }
        .zsd-issue-count {
            min-width: 28px; padding: 1px 8px; border-radius: 999px; text-align: center;
            font-size: var(--text-xs); font-weight: 700; font-variant-numeric: tabular-nums;
            color: var(--zsd-c); background: color-mix(in srgb, var(--zsd-c) 14%, transparent);
        }
        .zsd-issue-go { color: var(--zsd-muted); }

        .zsd-pattern { padding: 8px 0; }
        .zsd-pattern + .zsd-pattern { border-top: 1px solid var(--zsd-border); }
        .zsd-pattern-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .zsd-pattern-count { font-size: var(--text-sm); font-weight: 600; color: var(--zsd-ink); font-variant-numeric: tabular-nums; }
        .zsd-pattern-msg {
            margin: 4px 0 6px; font-size: var(--text-sm); color: var(--zsd-text);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .zsd-code {
            display: inline-block; padding: 1px 6px; border-radius: 4px;
            font-family: var(--font-family-monospace, monospace); font-size: 11px; font-weight: 600;
            color: var(--zsd-c, var(--zsd-muted));
            background: color-mix(in srgb, var(--zsd-c, var(--gray-500)) 12%, transparent);
        }
        .zsd-bar { height: 4px; border-radius: 999px; background: var(--zsd-surface-2); overflow: hidden; }
        .zsd-bar span { display: block; height: 100%; border-radius: 999px; background: var(--zsd-c); }
        .zsd-footnote { margin-top: 8px; font-size: var(--text-xs); color: var(--zsd-muted); }

        .zsd-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 20px 8px; text-align: center; }
        .zsd-empty-icon {
            display: flex; align-items: center; justify-content: center;
            width: 36px; height: 36px; margin-bottom: 4px; border-radius: 50%;
            color: var(--green-600, #059669); background: color-mix(in srgb, var(--green-500, #10b981) 12%, transparent);
        }
        .zsd-empty-title { font-size: var(--text-sm); font-weight: 600; color: var(--zsd-ink); }
        .zsd-empty-text { font-size: var(--text-xs); color: var(--zsd-muted); }

        .zsd-list { padding: 16px 0 8px; }
        .zsd-list .zsd-panel-head { padding: 0 16px; }
        .zsd-table-wrap { overflow-x: auto; }
        .zsd-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
        .zsd-table th {
            padding: 8px 12px; text-align: left; white-space: nowrap;
            font-size: var(--text-xs); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em;
            color: var(--zsd-muted); background: var(--zsd-surface-2);
            border-top: 1px solid var(--zsd-border); border-bottom: 1px solid var(--zsd-border);
        }
        .zsd-table th.text-right { text-align: right; }
        .zsd-table td { padding: 10px 12px; vertical-align: top; border-bottom: 1px solid var(--zsd-border); color: var(--zsd-text); }
        .zsd-table th:first-child, .zsd-table td:first-child { padding-left: 16px; }
        .zsd-table th:last-child, .zsd-table td:last-child { padding-right: 16px; }
        .zsd-table tbody tr:not(.zsd-detail-row):not(.zsd-empty-row):hover td { background: color-mix(in srgb, var(--zsd-surface-2) 60%, transparent); }
        .zsd-table tr.is-open td { border-bottom-color: transparent; }
        .zsd-inv-link { font-weight: 600; color: var(--zsd-ink) !important; }
        .zsd-inv-link:hover { color: var(--zsd-accent) !important; }
        .zsd-muted { font-size: var(--text-xs); color: var(--zsd-muted); }
        .zsd-amount { font-variant-numeric: tabular-nums; font-weight: 500; color: var(--zsd-ink); }
        .zsd-nowrap { white-space: nowrap; }
        .zsd-ellipsis { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .zsd-status {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 2px 10px 2px 8px; border-radius: 999px;
            font-size: var(--text-xs); font-weight: 500;
            color: var(--zsd-ink) !important;
            background: color-mix(in srgb, var(--zsd-c) 12%, transparent);
        }
        .zsd-status:hover { text-decoration: none; background: color-mix(in srgb, var(--zsd-c) 20%, transparent); }
        .zsd-reason-cell { min-width: 180px; }
        .zsd-reason { font-size: var(--text-xs); color: var(--zsd-muted); }
        .zsd-age { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
        .zsd-age b { font-variant-numeric: tabular-nums; color: var(--zsd-ink); }
        .zsd-flag {
            padding: 0 8px; border-radius: 999px; line-height: 18px;
            font-size: 11px; font-weight: 600;
            color: var(--zsd-c); background: color-mix(in srgb, var(--zsd-c) 14%, transparent);
        }
        .zsd-toggle {
            display: inline-flex; align-items: center; gap: 2px; margin-top: 4px;
            font-size: var(--text-xs); font-weight: 500; color: var(--zsd-accent) !important; cursor: pointer;
        }
        .zsd-toggle .zsd-glyph { transition: transform 0.15s ease; }
        tr.is-open .zsd-toggle .zsd-glyph { transform: rotate(90deg); }

        .zsd-detail-row td { padding-top: 0; }
        .zsd-errors {
            padding: 10px 12px;
            border-radius: var(--zsd-radius-sm);
            border-left: 3px solid var(--zsd-c, var(--red-500));
            background: var(--zsd-surface-2);
        }
        .zsd-errors li { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding: 3px 0; font-size: var(--text-sm); }
        .zsd-error-msg { flex: 1; min-width: 200px; color: var(--zsd-text); }
        .zsd-error-cat { font-size: var(--text-xs); color: var(--zsd-muted); }
        .zsd-fix-hint { margin-top: 8px; font-size: var(--text-xs); color: var(--zsd-muted); }
        .zsd-list-footer { display: flex; justify-content: center; padding: 10px 16px 4px; }
        .zsd-list-footer:empty { display: none; }

        .zsd-skeleton {
            min-height: 160px; border-radius: var(--zsd-radius);
            background: linear-gradient(90deg, var(--zsd-surface-2), var(--zsd-surface), var(--zsd-surface-2));
            background-size: 200% 100%;
            animation: zsd-shimmer 1.2s ease-in-out infinite;
        }
        .zsd-card.zsd-skeleton { min-height: 120px; }
        @keyframes zsd-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

        @media (max-width: 1399px) {
            .zsd-cards { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        }
        @media (max-width: 767px) {
            .zsd-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 12px; }
            .zsd-stat:nth-child(3) { padding-left: 0; border-left: none; }
            .zsd-panels { grid-template-columns: 1fr; }
            .zsd-filter, .zsd-filter-company { width: calc(50% - 4px); }
        }
        @media (prefers-reduced-motion: reduce) {
            .zsd-main *, .zsd-desk-split * { transition: none !important; animation: none !important; }
        }
    `);
}
