/* Swift Theme — presets inside Frappe's own theme picker

   Frappe offers Light / Dark / Automatic in two places: the Switch Theme
   dialog (Ctrl+Shift+G) and, since 16.50, the Appearance tab of its user
   settings. Both build a frappe.ui.ThemeSwitcher; the Appearance tab keeps
   only its card grid (switcher.body) and throws the dialog away. So the
   presets go inside that grid, not under it in the dialog, and appear in
   both places.

   Three deliberate choices:
   * The cards use Frappe's own card markup (theme-card-wrapper, theme-card,
     theme-preview-*), so they inherit its card styling instead of duplicating
     it here. Each preview is fed the preset's colours, so it shows that
     preset rather than Frappe's light or dark.
   * "Custom Colors" is a card like any other; the two pickers only appear once
     it is chosen, so the picker stays a simple list until you ask for more.
   * Frappe's own Light / Dark / Automatic cards are put away while a Swift
     scheme is on (swift-desk.css). The scheme decides light or dark
     (swift-boot.js), so those cards could still be clicked and would change
     nothing on screen.

   setup_dialog is wrapped rather than replaced, so Frappe still builds the
   picker. */

(function () {
    if (!window.frappe) return;

    var CUSTOM_KEY = "__swift_custom__";

    frappe.after_ajax(function () {
        var Switcher = frappe.ui && frappe.ui.ThemeSwitcher;
        if (!Switcher || Switcher.prototype.__swiftExtended) return;
        Switcher.prototype.__swiftExtended = true;

        var originalSetup = Switcher.prototype.setup_dialog;
        Switcher.prototype.setup_dialog = function () {
            originalSetup.call(this);
            try {
                host(this);
                render(this);
            } catch (e) {
                // Frappe's own switcher must keep working even if ours can't.
                console.warn("Swift theme section failed to render", e);
            }
        };
    });

    function boot() {
        return (window.frappe && frappe.boot && frappe.boot.swift_theme) || {};
    }

    /* Frappe's grid becomes the host, so the section travels with it into
       the Appearance tab. Its arrow keys are stilled while its cards are put
       away: the dialog's handler walks this.themes and clicks the next card,
       which would save a mode nobody can see. It returns early while there
       are no themes, so the list is emptied once Frappe has drawn it. */
    function host(switcher) {
        switcher.body.addClass("swift-switch-host");
        var frappeRender = switcher.render;
        switcher.render = function () {
            frappeRender.apply(this, arguments);
            if (document.documentElement.getAttribute("data-swift-scheme")) this.themes = null;
        };
    }

    function render(switcher) {
        var prefs = boot();
        var $host = switcher.body;

        // Both gates, not just the permission one. Enable Theme Switcher is the
        // site-wide switch, and it has to reach here too: the navbar chip
        // honoured it while this section carried on adding presets to Frappe's
        // own Switch Theme dialog, so turning the switcher off only half worked.
        var presets = prefs.presets || [];
        if (!prefs.enable_switcher || !prefs.can_switch_theme || !presets.length) {
            // Frappe's cards are put away all the same, so say why it is empty.
            if (document.documentElement.getAttribute("data-swift-scheme")) {
                $('<p class="swift-switch-note"></p>')
                    .text(__("Light or dark comes with this site's theme."))
                    .appendTo($host);
            }
            return;
        }

        var $section = $(
            '<div class="swift-switch">' +
            '<div class="swift-switch-head">' +
            "<span>" + __("Swift Theme") + "</span>" +
            '<button type="button" class="swift-switch-reset">' + __("Use site default") + "</button>" +
            "</div>" +
            '<div class="theme-grid swift-theme-grid"></div>' +
            '<div class="swift-custom" hidden></div>' +
            "</div>"
        ).appendTo($host);

        var $grid = $section.find(".swift-theme-grid");
        var $custom = $section.find(".swift-custom");

        var activePreset = document.documentElement.getAttribute("data-swift-preset") || "";
        var onCustom = !activePreset && prefs.color_mode === "Custom Colors";

        presets.forEach(function (p) {
            $grid.append(card(p, p.key === activePreset, function () {
                select($grid, p.key);
                $custom.attr("hidden", true);
                window.SwiftTheme.setPreset(p.key);
                frappe.show_alert({ message: __("Theme set to {0}", [p.label]), indicator: "green" });
            }));
        });

        // Custom colours as a card in the same grid; picking it reveals step two.
        $grid.append(card(customPreview(prefs), onCustom, function () {
            select($grid, CUSTOM_KEY);
            $custom.removeAttr("hidden");
            $custom.find("input").first().trigger("focus");
        }));

        buildCustomPanel($custom, $grid, prefs);
        if (onCustom) $custom.removeAttr("hidden");

        $section.find(".swift-switch-reset").on("click", function () {
            if (!(window.SwiftTheme && window.SwiftTheme.clearPersonalTheme)) return;
            window.SwiftTheme.clearPersonalTheme();
            $grid.find("[data-swift-card]").removeClass("selected");
            $custom.attr("hidden", true);
            frappe.show_alert({ message: __("Using the site theme"), indicator: "blue" });
        });
    }

    function customPreview(prefs) {
        return {
            key: CUSTOM_KEY,
            label: __("Custom Colors"),
            mode: prefs.is_dark ? "dark" : "light",
            primary: prefs.primary || "#4f46e5",
            secondary: prefs.secondary || "#7c3aed",
            bg: prefs.is_dark ? "#0f172a" : "#f5f7fa",
            card: prefs.is_dark ? "#1e293b" : "#ffffff",
            muted: prefs.is_dark ? "#94a3b8" : "#64748b",
        };
    }

    /* Frappe's card (ui/theme_switcher.js, get_preview_html), with the preset's
       colours handed to the preview as custom properties; swift-desk.css turns
       them into the tokens Frappe's preview is drawn with. */
    function card(p, selected, onClick) {
        var field =
            '<div class="theme-preview-field">' +
            '<div class="theme-preview-label"></div>' +
            '<div class="theme-preview-input"></div>' +
            "</div>";
        var $card = $(
            '<div class="theme-card-wrapper' + (selected ? " selected" : "") + '">' +
            '<button type="button" class="theme-card">' +
            '<div class="theme-card-preview">' +
            '<div class="theme-preview-container swift-preview">' +
            '<div class="theme-preview-frame">' +
            '<div class="theme-preview-titlebar">' +
            '<span class="theme-preview-dot theme-preview-dot--red"></span>' +
            '<span class="theme-preview-dot theme-preview-dot--yellow"></span>' +
            '<span class="theme-preview-dot theme-preview-dot--green"></span>' +
            "</div>" +
            '<div class="theme-preview-content">' +
            '<div class="theme-preview-sidebar"></div>' +
            '<div class="theme-preview-main">' +
            '<div class="theme-preview-header">' +
            '<div class="theme-preview-header-title"></div>' +
            '<div class="theme-preview-header-action"></div>' +
            "</div>" +
            '<div class="theme-preview-body">' + field + field + field + field + "</div>" +
            "</div>" +
            "</div>" +
            "</div>" +
            "</div>" +
            "</div>" +
            '<div class="theme-card-footer">' +
            '<span class="theme-card-label"></span>' +
            '<span class="theme-card-radio"></span>' +
            "</div>" +
            "</button>" +
            "</div>"
        );

        $card.attr("data-swift-card", p.key);
        $card.find(".theme-card-label").text(p.label);
        $card.find(".theme-card").attr("title", p.label + " · " + (p.mode === "dark" ? __("Dark") : __("Light"))
            + (p.backdrop && p.backdrop !== "none" ? " · " + p.backdrop : ""));
        paintPreview($card, p);

        $card.find(".theme-card").on("click", onClick);
        return $card;
    }

    function paintPreview($card, p) {
        var preview = $card.find(".swift-preview")[0];
        preview.style.setProperty("--p-canvas", p.bg);
        preview.style.setProperty("--p-card", p.card);
        preview.style.setProperty("--p-ink", p.muted);
        preview.style.setProperty("--p-primary", p.primary);
        preview.style.setProperty("--p-secondary", p.secondary);
    }

    function select($grid, key) {
        $grid.find("[data-swift-card]").removeClass("selected");
        $grid.find('[data-swift-card="' + key + '"]').addClass("selected");
    }

    /* Step two: only reached once the Custom Colors card is chosen. */
    function buildCustomPanel($custom, $grid, prefs) {
        $custom.html(
            '<div class="swift-custom-head">' + __("Pick your two colours") + "</div>" +
            '<div class="swift-custom-row">' +
            "<label><span>" + __("Primary") + "</span>" +
            '<input type="color" class="swift-color-primary"></label>' +
            "<label><span>" + __("Secondary") + "</span>" +
            '<input type="color" class="swift-color-secondary"></label>' +
            '<button type="button" class="btn btn-sm btn-primary swift-custom-apply">' +
            __("Apply") + "</button>" +
            "</div>" +
            '<div class="swift-custom-preview"></div>'
        );

        var $primary = $custom.find(".swift-color-primary").val(prefs.primary || "#4f46e5");
        var $secondary = $custom.find(".swift-color-secondary").val(prefs.secondary || "#7c3aed");
        var $preview = $custom.find(".swift-custom-preview");
        var $customCard = $grid.find('[data-swift-card="' + CUSTOM_KEY + '"]');

        function paint() {
            $preview.css("background", "linear-gradient(135deg," + $primary.val() + "," + $secondary.val() + ")");
            var preview = $customCard.find(".swift-preview")[0];
            if (!preview) return;
            preview.style.setProperty("--p-primary", $primary.val());
            preview.style.setProperty("--p-secondary", $secondary.val());
        }
        paint();
        $primary.on("input", paint);
        $secondary.on("input", paint);

        $custom.find(".swift-custom-apply").on("click", function () {
            if (!(window.SwiftTheme && window.SwiftTheme.setCustomColors)) return;
            window.SwiftTheme.setCustomColors($primary.val(), $secondary.val());
            select($grid, CUSTOM_KEY);
            frappe.show_alert({ message: __("Custom colours applied"), indicator: "green" });
        });
    }
})();
