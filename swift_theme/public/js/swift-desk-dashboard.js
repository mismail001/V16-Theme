// Dashboard beside the apps on the desk page (/desk).
//
// The desk page is split in three: the desktop icons keep the left third, and a dashboard takes the right two thirds.
// Which dashboard depends on the site: the ZATCA submission status when KSA Compliance is installed and the user can
// read its invoice records, and the Business Overview otherwise.
//
// Frappe's desktop page (desk/page/desktop) re-renders its body on every show and announces each render with a
// `desktop_screen` event once the icons are in, so the split is applied there rather than by patching the page.

import { ZatcaStatusDashboard, set_zsd_style, zsd_glyph } from "./swift-zatca-dashboard.js";
import { OverviewDashboard } from "./swift-overview-dashboard.js";

function pick_dashboard() {
    // frappe.boot.versions lists the apps installed on this site, not merely present on the bench
    const has_ksa = "ksa_compliance" in (frappe.boot.versions || {});
    if (has_ksa && frappe.model.can_read("Sales Invoice Additional Fields")) {
        return { key: "zatca", Dashboard: ZatcaStatusDashboard };
    }
    return { key: "overview", Dashboard: OverviewDashboard };
}

$(document).on("desktop_screen", function () {
    const $container = $("body.desktop-page .desktop-container").first();
    if (!$container.length || $container.children(".zsd-desk-pane").length) return;

    // This runs inside the desk page's own setup (avatar, notifications, search come after the event), so a failure
    // here must never escape: undo the split and leave the desk as Frappe drew it.
    try {
        set_zsd_style();
        const { key, Dashboard } = pick_dashboard();
        // Remembered across re-renders of the desk page, so returning to it keeps the user's filters
        const states = frappe.pages["desktop"].__zsd_states || (frappe.pages["desktop"].__zsd_states = {});
        const state = states[key] || (states[key] = {});
        $container.addClass("zsd-desk-split");
        $container.children(".icons-container").first().addClass("zsd-apps-panel").prepend(`
            <div class="zsd-apps-head">${zsd_glyph("grid", 14)}<span>${__("Apps")}</span></div>
        `);
        const $pane = $(`<div class="zsd-desk-pane"></div>`).appendTo($container);
        new Dashboard($pane, state);
    } catch (e) {
        console.error("Desk dashboard failed to load", e);
        $container.removeClass("zsd-desk-split").children(".zsd-desk-pane").remove();
        $container.find(".zsd-apps-head").remove();
        $container.children(".icons-container").removeClass("zsd-apps-panel");
    }
});
