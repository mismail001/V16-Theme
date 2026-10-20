/* Swift Theme — record counts in the desk sidebar

   Every DocType link in the sidebar shows how many records it leads to, at
   the row's far end ("Sales Invoice   1.2K"). The number is the one the user
   would see on opening the list: the link's own filters, read permission and
   User Permissions all apply (swift_theme.api.sidebar.get_sidebar_counts).

   Wraps frappe.ui.sidebar_item.TypeLink.prototype.make, which draws each
   row. Rows drawn in one pass are gathered and asked for in one request, and
   the answers are kept for a minute, so switching between workspaces does not
   re-count what was just counted. A count older than that is refreshed on the
   next route change.

   The badge carries Frappe's own .sidebar-item-suffix class, so the collapsed
   sidebar hides it the way it hides the labels (sidebar.scss).

   Gated by Swift Theme Settings > Show Sidebar Record Counts
   (boot.swift_theme.enable_sidebar_counts); the server method checks the
   same switch, so turning it off also stops the counting queries. */

(function () {
    if (!(window.frappe && frappe.ui && frappe.ui.sidebar_item && frappe.ui.sidebar_item.TypeLink)) return;

    var Link = frappe.ui.sidebar_item.TypeLink;
    if (Link.prototype.__swiftSidebarCounts) return;
    Link.prototype.__swiftSidebarCounts = true;

    function enabled() {
        var boot = frappe.boot && frappe.boot.swift_theme;
        return !!(boot && boot.enable_sidebar_counts);
    }

    var TTL = 60 * 1000;
    var cache = {};      // key -> {count, at}
    var rows = {};       // key -> [anchor elements]
    var link_of = {};    // key -> {key, doctype, filters}
    var queued = {};
    var timer = null;

    function key_for(item) {
        return item.link_to + "|" + (item.filters || "");
    }

    function parse_filters(item) {
        try {
            var f = item.filters ? JSON.parse(item.filters) : null;
            return Array.isArray(f) && f.length ? f : null;
        } catch (e) {
            return null;
        }
    }

    function label(count) {
        return count >= 1000 ? frappe.utils.shorten_number(count, null, 4, 1) : String(count);
    }

    function paint(key) {
        var hit = cache[key];
        (rows[key] || []).forEach(function (anchor) {
            if (!anchor.isConnected) return;
            var badge = anchor.querySelector(":scope > .swift-sidebar-count");
            if (!hit || hit.count == null) {
                if (badge) badge.remove();
                return;
            }
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "sidebar-item-suffix swift-sidebar-count";
                var control = anchor.querySelector(":scope > .sidebar-item-control");
                anchor.insertBefore(badge, control);
            }
            badge.textContent = label(hit.count);
            badge.title = __("{0} records", [format_number(hit.count, null, 0)]);
        });
        // Drop rows a re-render took off the page.
        if (rows[key]) rows[key] = rows[key].filter(function (a) { return a.isConnected; });
    }

    function flush() {
        timer = null;
        var keys = Object.keys(queued);
        queued = {};
        if (!keys.length) return;
        frappe
            .xcall("swift_theme.api.sidebar.get_sidebar_counts", {
                links: keys.map(function (k) { return link_of[k]; }),
            })
            .then(function (counts) {
                var now = Date.now();
                keys.forEach(function (k) {
                    cache[k] = { count: counts && k in counts ? counts[k] : null, at: now };
                    paint(k);
                });
            })
            .catch(function (e) {
                console.warn("Swift sidebar counts failed", e);
            });
    }

    function request(key) {
        queued[key] = true;
        if (!timer) timer = setTimeout(flush, 50);
    }

    function track(item, anchor) {
        var key = key_for(item);
        link_of[key] = { key: key, doctype: item.link_to, filters: parse_filters(item) };
        (rows[key] = rows[key] || []).push(anchor);
        var hit = cache[key];
        if (hit) paint(key);
        if (!hit || Date.now() - hit.at > TTL) request(key);
    }

    var make = Link.prototype.make;
    Link.prototype.make = function () {
        var out = make.apply(this, arguments);
        try {
            var item = this.item;
            if (enabled() && item && item.type === "Link" && item.link_type === "DocType" && item.link_to && this.wrapper) {
                var anchor = this.wrapper.find("a.item-anchor").get(0);
                if (anchor) track(item, anchor);
            }
        } catch (e) {
            // The row must keep working even if its count can't.
            console.warn("Swift sidebar count failed", e);
        }
        return out;
    };

    // New and deleted records change the numbers; refresh the stale ones
    // whenever the user moves on, which is when they are likely to look.
    if (frappe.router && frappe.router.on) {
        frappe.router.on("change", function () {
            if (!enabled()) return;
            var now = Date.now();
            Object.keys(rows).forEach(function (k) {
                if (rows[k].some(function (a) { return a.isConnected; }) && (!cache[k] || now - cache[k].at > TTL)) {
                    request(k);
                }
            });
        });
    }
})();
