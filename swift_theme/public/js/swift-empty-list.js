/* Swift Theme — empty list

   The "No Sales Order created" panel a list shows when it has nothing to
   list, made into something that reads as a starting point:

   * the icon is the brand's "mim-art-card" for every list (the DocType's
     own until that symbol is in the theme's sprite), on a rounded tile in
     the brand pair, with a small badge saying why the list is empty — a
     plus when nothing has been created, a search mark when the filters hide
     everything;
   * the Create button names what it creates ("Create Sales Order") and is
     the solid, primary button;
   * when filters are what emptied it, a "Clear filters" button sits beside
     it, since that is the one thing the description tells you to do.

   Frappe builds the panel as an HTML string (get_no_result_message, through
   frappe.ui.empty_state.html) and wires the buttons afterwards by class in
   setup_new_doc_event. The string is reworked here and the classes kept, so
   Frappe's own Create and Import handlers still find their buttons; the
   clear-filters button is wired in the same place. */

(function () {
    if (!(window.frappe && frappe.views && frappe.views.ListView)) return;

    var List = frappe.views.ListView;
    if (List.prototype.__swiftEmptyList) return;
    List.prototype.__swiftEmptyList = true;

    var EMPTY_ICON = "mim-art-card";

    function hasFilters(list) {
        var filters = list.filter_area && list.filter_area.get();
        return !!(filters && filters.length);
    }

    function rework(list, html) {
        var tpl = document.createElement("template");
        tpl.innerHTML = String(html || "").trim();
        var root = tpl.content.firstElementChild;
        if (!root) return html;

        var filtered = hasFilters(list);
        root.classList.add("swift-empty-state");
        root.setAttribute("data-swift-empty", filtered ? "filtered" : "none");

        // The icon well: Frappe's round grey disc becomes our tile + badge.
        var well = root.firstElementChild;
        if (well && well.querySelector("svg")) {
            well.className = "swift-empty-icon";
            // Every empty list shows the one brand icon, once its symbol is
            // in the theme's sprite (public/icons/swift-icons.svg). Until
            // then the DocType's own icon stays rather than a blank tile.
            if (document.getElementById("icon-" + EMPTY_ICON)) {
                well.innerHTML = frappe.utils.icon(EMPTY_ICON, "md", "", "", "", true);
            }
            var badge = document.createElement("span");
            badge.className = "swift-empty-badge";
            badge.innerHTML = frappe.utils.icon(filtered ? "search-x" : "plus", "xs", "", "", "", true);
            well.appendChild(badge);
        }

        var doctype = __(list.doctype);
        var create = root.querySelector(".btn-new-doc");
        if (create) {
            var label = create.querySelector(".es-button__label") || create;
            label.textContent = __("Create {0}", [doctype]);
            create.setAttribute("data-variant", "solid");
            create.setAttribute("title", __("Create {0}", [doctype]));
        }

        if (filtered && list.filter_area) {
            var row = (create || root.querySelector(".es-button") || {}).parentElement;
            if (!row) {
                row = document.createElement("div");
                row.className = "flex flex-wrap items-center justify-center gap-2";
                root.appendChild(row);
            }
            var clear = frappe.ui.button({
                label: __("Clear filters"),
                icon: "x",
                variant: "outline",
                css_class: "swift-btn-clear-filters",
            })[0];
            row.appendChild(clear);
        }

        return root.outerHTML;
    }

    var getMessage = List.prototype.get_no_result_message;
    List.prototype.get_no_result_message = function () {
        var html = getMessage.apply(this, arguments);
        try {
            return rework(this, html);
        } catch (e) {
            // Frappe's own panel must keep working even if ours can't.
            console.warn("Swift empty list failed", e);
            return html;
        }
    };

    var setupNew = List.prototype.setup_new_doc_event;
    List.prototype.setup_new_doc_event = function () {
        var out = setupNew.apply(this, arguments);
        var list = this;
        if (this.$no_result) {
            this.$no_result.find(".swift-btn-clear-filters").off("click.swift").on("click.swift", function () {
                list.filter_area && list.filter_area.clear();
            });
        }
        return out;
    };
})();
