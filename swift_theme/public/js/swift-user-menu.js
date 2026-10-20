/* Swift Theme — user menu

   Adds "Toggle Full Width" to the user menu, after Reload. Frappe 16 builds
   that menu inline in Sidebar.create_user_menu, from a literal list with no
   hook, and both the sidebar's user button and the dock's avatar go through
   it. So the method is wrapped: for the length of the call frappe.ui.Dropdown
   is swapped for a subclass that adds the row to the options it is handed,
   and Frappe still builds the menu itself.

   Runs at load, not after_ajax: this bundle loads after Frappe's desk bundle
   (so the class exists) and before the app starts (so no menu exists yet). */

(function () {
    if (!(window.frappe && frappe.ui && frappe.ui.Sidebar)) return;

    var Sidebar = frappe.ui.Sidebar;
    if (Sidebar.prototype.__swiftUserMenu) return;
    Sidebar.prototype.__swiftUserMenu = true;

    var NAME = "toggle-full-width";

    // Built per menu rather than at load, so __() runs once the boot's
    // translations are in.
    function fullWidthRow() {
        return {
            name: NAME,
            label: __("Toggle Full Width"),
            icon: "move-horizontal",
            onclick: function () {
                frappe.ui.toolbar.toggle_full_width();
            },
        };
    }

    // After Reload when it is there, so it sits with the other view rows and
    // stays above the rule that separates Logout.
    function addRow(options) {
        if (!Array.isArray(options) || !options.length) return;
        var group = options[0];
        if (!group || !Array.isArray(group.options)) return;
        if (group.options.some(function (o) { return o.name === NAME; })) return;

        var at = group.options.findIndex(function (o) { return o.name === "reload"; });
        group.options.splice(at === -1 ? group.options.length : at + 1, 0, fullWidthRow());
    }

    var original = Sidebar.prototype.create_user_menu;
    Sidebar.prototype.create_user_menu = function () {
        var Dropdown = frappe.ui.Dropdown;
        frappe.ui.Dropdown = class extends Dropdown {
            constructor(opts) {
                try {
                    addRow(opts && opts.options);
                } catch (e) {
                    // Frappe's own menu must keep working even if ours can't.
                    console.warn("Swift user menu row failed to add", e);
                }
                super(opts);
            }
        };
        try {
            return original.apply(this, arguments);
        } finally {
            frappe.ui.Dropdown = Dropdown;
        }
    };
})();
