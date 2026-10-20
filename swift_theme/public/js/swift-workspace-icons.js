/* Swift Theme — workspace icons in the sidebar header

   The sidebar header names the workspace/module you are in ("Accounting",
   "Stock" ...) and draws a mark beside it. On a desk without the dock,
   Frappe draws the owning app's logo there — and the theme replaces every
   app's logo with the brand mark (api/boot.py _apply_brand_mark), so every
   workspace showed the same company logo. The header now shows the icon set
   on the Workspace itself (Workspace > Icon), the one Frappe's own dock and
   workspace list use.

   Which workspace:
   1. the one on screen, when the route is a workspace page;
   2. otherwise the sidebar's own: a workspace named or titled like the
      sidebar, then the module's workspace (frappe.modules).
   A workspace without an icon keeps Frappe's mark, so nothing goes blank.

   Wraps frappe.ui.SidebarHeader.prototype.get_header_logo, which Frappe
   calls on every route change (Sidebar.setup_events -> refresh_header), so
   the icon follows navigation between workspaces of one module too. */

(function () {
    if (!(window.frappe && frappe.ui && frappe.ui.SidebarHeader)) return;

    var Header = frappe.ui.SidebarHeader;
    if (Header.prototype.__swiftWorkspaceIcons) return;
    Header.prototype.__swiftWorkspaceIcons = true;

    function by_name(name) {
        if (!name || !frappe.workspaces) return null;
        return frappe.workspaces[frappe.router.slug(name)] || null;
    }

    function on_screen() {
        var route = frappe.get_route() || [];
        if (route[0] !== "Workspaces") return null;
        return by_name(route[route.length - 1]);
    }

    function for_module(header) {
        var module = header.sidebar && header.sidebar.current_module;
        var title = header.title;
        var pages = Object.values(frappe.workspaces || {});
        return (
            by_name(title) ||
            by_name(module) ||
            pages.find(function (p) { return p.title && (p.title === title || p.title === module); }) ||
            (frappe.modules && module && frappe.modules[module]) ||
            null
        );
    }

    function workspace_icon(header) {
        var page = on_screen() || for_module(header);
        return page && page.icon ? page.icon : null;
    }

    var getLogo = Header.prototype.get_header_logo;
    Header.prototype.get_header_logo = function () {
        try {
            var icon = workspace_icon(this);
            if (icon) {
                return '<span class="swift-workspace-icon">' + frappe.utils.icon(icon, "md") + "</span>";
            }
        } catch (e) {
            // The header must keep its mark even if ours can't be found.
            console.warn("Swift workspace icon failed", e);
        }
        return getLogo.apply(this, arguments);
    };
})();
