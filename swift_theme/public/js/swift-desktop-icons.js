/* Swift Theme — workspace icons on the desk's Apps screen

   /desk (Desktop Settings > Desktop Page = Apps) shows one tile per app, each
   drawn with the app's logo (desktop_icon.html, img.app-icon). The theme
   replaces every app's logo with the brand mark (api/boot.py
   _apply_brand_mark), so every tile showed the same company logo. Each tile
   now shows the icon set on the Workspace it opens (Workspace > Icon).

   Which workspace, for an app:
   1. the one the tile opens — its landing route names it;
   2. a Workspace among the app's dock entries;
   3. the workspace of the app's first module.
   Only a Workspace's own icon is used, never the dock row's: the dock's
   Sidebar rows carry icons of their own (sliders-soft, briefcase-soft ...),
   and those are what showed before this order was settled. An app none of
   these finds an icon for keeps its logo.

   The page class (desk/page/desktop/desktop.js) is loaded with the page,
   after this bundle, so it cannot be wrapped ahead of time. It announces each
   render with a `desktop_screen` event on the document, after the tiles are
   in; the tiles are re-drawn here then, matched to their app by title. */

(function () {
    if (!window.frappe) return;

    function apps() {
        return (frappe.boot && frappe.boot.app_data) || [];
    }

    function by_slug(name) {
        if (!name || !frappe.workspaces) return null;
        return frappe.workspaces[frappe.router.slug(name)] || null;
    }

    function icon_for(app) {
        var sidebar = frappe.app && frappe.app.sidebar;
        if (!sidebar) return null;

        // 1. The workspace the tile opens: the last segment of its landing
        //    route (/desk/setup/home -> Home, /desk/hr-setup -> HR Setup).
        var route = sidebar.app_landing_route ? sidebar.app_landing_route(app) : null;
        if (route && sidebar.is_desk_route && sidebar.is_desk_route(route)) {
            var last = route.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop();
            var page = by_slug(decodeURIComponent(last || ""));
            if (page && page.icon) return page.icon;
        }

        // 2. A workspace among the app's dock entries.
        var entries = (sidebar.collect_dock_entries && sidebar.collect_dock_entries(app)) || [];
        for (var i = 0; i < entries.length; i++) {
            if (entries[i] && entries[i].page && entries[i].page.icon) return entries[i].page.icon;
        }

        // 3. The workspace of the app's first module.
        var module = sidebar.first_navigable_module ? sidebar.first_navigable_module(app) : null;
        var mod_page = module && frappe.modules && frappe.modules[module];
        return (mod_page && mod_page.icon) || null;
    }

    function apply(root) {
        var tiles = (root || document).querySelectorAll("body.desktop-page .desktop-icon");
        if (!tiles.length) return;

        var by_title = {};
        apps().forEach(function (app) {
            if (app.on_apps_screen) by_title[app.app_title || app.app_name] = app;
        });

        tiles.forEach(function (tile) {
            if (tile.dataset.swiftWsIcon) return;
            var title = tile.querySelector(".icon-title");
            var app = title && by_title[(title.getAttribute("data-original-title") || title.textContent || "").trim()];
            if (!app) {
                // The title is translated; fall back to matching it that way.
                var text = title ? title.textContent.trim() : "";
                app = apps().find(function (a) { return __(a.app_title || a.app_name) === text; });
            }
            if (!app) return;

            var icon = icon_for(app);
            var link = tile.querySelector(".icon-link");
            if (!icon || !link) return;

            tile.dataset.swiftWsIcon = icon;
            link.innerHTML =
                '<div class="icon-container swift-ws-tile">' + frappe.utils.icon(icon, "lg") + "</div>";
        });
    }

    $(document).on("desktop_screen", function () {
        try {
            apply();
        } catch (e) {
            // The tiles keep their logos if this can't resolve them.
            console.warn("Swift desktop workspace icons failed", e);
        }
    });
})();
