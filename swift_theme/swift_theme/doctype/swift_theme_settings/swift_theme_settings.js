frappe.ui.form.on("Swift Theme Settings", {
    refresh(frm) {
        frm.add_custom_button(__("Reapply Theme"), () => {
            reloadTheme().then(() => {
                frappe.show_alert({ message: __("Swift Theme reapplied"), indicator: "green" });
            });
        });

        toggleFieldVisibility(frm);
        showSoundHint(frm);
        decorateForm(frm);
    },

    sound_events(frm) {
        showSoundHint(frm);
    },

    // Saving broadcasts swift_theme_updated to every desk session, but apply it
    // here too so the admin sees the change the instant the save returns.
    after_save() {
        reloadTheme();
    },

    color_mode(frm) {
        toggleFieldVisibility(frm);
    },

    active_preset(frm) {
        previewColors(frm);
    },

    primary_color(frm) {
        previewColors(frm);
    },

    secondary_color(frm) {
        previewColors(frm);
    },

    custom_mode(frm) {
        previewColors(frm);
    },

    custom_strength(frm) {
        previewColors(frm);
    },

    enable_sounds(frm) {
        toggleFieldVisibility(frm);
        showSoundHint(frm);
    },
});

// Lucide names from Frappe's own sprite (/assets/frappe/icons/lucide/icons.svg),
// so nothing extra is shipped or requested. Keyed by fieldname; a field missing
// here falls back to its type's icon (swift-field-icons.js) rather than going
// without.
const FIELD_ICONS = {
    // Tabs
    colour_tab: "palette",
    desk_tab: "monitor",
    features_tab: "sparkles",
    brand_tab: "badge-check",
    login_tab: "log-in",
    extras_tab: "puzzle",

    // Sections
    color_mode_section: "palette",
    custom_colors_section: "pipette",
    defaults_section: "sliders-horizontal",
    sidebar_section: "navigation",
    home_section: "house",
    calendar_section: "calendar",
    orgchart_section: "network",
    features_section: "sparkles",
    brand_section: "badge-check",
    login_section: "log-in",
    login_panel_section: "panel-left-open",
    auto_dark_section: "moon-star",
    sounds_section: "volume-2",

    // Colour
    color_mode: "palette",
    active_preset: "swatch-book",
    primary_color: "paint-bucket",
    secondary_color: "paintbrush",
    custom_mode: "sun-moon",
    custom_strength: "contrast",
    custom_sidebar_gradient: "blend",
    backdrop: "wallpaper",
    background_image: "image-plus",
    background_overlay: "contrast",

    // Desk
    default_density: "rows-3",
    default_radius: "square-round-corner",
    default_font_scale: "a-large-small",
    default_font_family: "type",
    navbar_variant: "panel-top",
    sidebar_variant: "panel-left",
    sidebar_brand_fill: "paint-roller",
    sidebar_texture: "grid-3x3",
    enable_home_page: "house",
    home_preset: "layout-dashboard",
    home_greeting: "hand",
    home_shortcuts: "zap",
    home_cards: "layout-grid",
    calendar_fields: "calendar-days",
    orgchart_fields: "network",

    // Features
    enable_switcher: "paintbrush-vertical",
    enable_command_palette: "command",
    enable_focus_mode: "focus",
    enable_sidebar_counts: "hash",
    enable_backdrops: "image",
    show_backdrop_through: "layers",
    enable_perf_mode: "gauge",
    enable_styled_scrollbar: "arrow-down-up",
    enable_toast_theming: "message-square",
    enable_print_theming: "printer",
    print_font_family: "file-type",

    // Brand
    brand_name: "badge",
    brand_favicon: "app-window",
    brand_logo: "image",
    brand_logo_dark: "moon",

    // Login page
    login_layout: "layout-template",
    login_tagline: "quote",
    login_bg_image: "image-plus",
    login_show_brand_panel: "panel-left-open",
    login_heading: "heading",
    login_description: "text-quote",
    login_points: "list-checks",
    login_stat_value: "trending-up",
    login_stat_label: "captions",

    // Extras
    enable_auto_dark: "moon-star",
    auto_dark_start: "sunset",
    auto_dark_end: "sunrise",
    enable_sounds: "volume-2",
    volume_level: "sliders-horizontal",
    sound_events: "music",
};

// Field labels are drawn by swift-field-icons.js on every form; this form
// only names its own icons. Registered at load, before the layout first
// calls set_label.
if (window.SwiftFieldIcons) {
    window.SwiftFieldIcons.register("Swift Theme Settings", FIELD_ICONS);
}

function iconHtml(name, cls) {
    return `<span class="${cls}" aria-hidden="true">${frappe.utils.icon(name, "sm")}</span>`;
}

// Puts an icon in front of every tab and section heading, and tags the form
// so swift-settings-form.css styles this form only. Each pass checks for its
// own icon instead of assuming the previous one survived a re-render.
function decorateForm(frm) {
    frm.page.wrapper.addClass("swift-settings-form");

    frm.layout.tabs.forEach((tab) => {
        const name = FIELD_ICONS[tab.df.fieldname];
        const $link = tab.tab_link && tab.tab_link.find(".nav-link");
        if (!name || !$link || $link.find(".swift-tab-icon").length) return;
        $link.prepend(iconHtml(name, "swift-tab-icon"));
    });

    frm.layout.sections.forEach((section) => {
        const name = section.df && FIELD_ICONS[section.df.fieldname];
        const $head = name && section.wrapper && section.wrapper.children(".section-head");
        if (!$head || !$head.length || $head.find(".swift-section-icon").length) return;
        $head.prepend(iconHtml(name, "swift-section-icon"));
    });
}

// Sounds enabled with no file attached is a silent no-op — the app ships no
// audio, so say so on the form instead of letting it look broken.
function showSoundHint(frm) {
    frm.dashboard.clear_comment();
    if (!frm.doc.enable_sounds) return;

    const configured = (frm.doc.sound_events || []).filter((row) => row.sound_file);
    if (configured.length) return;

    frm.dashboard.add_comment(
        __(
            "Sounds are enabled but no sound file is attached. Add a row to <b>Sound Events</b>, pick an <b>Event Key</b> and attach an audio file — events without a file stay silent."
        ),
        "yellow",
        true
    );
}

// Live preview before saving, so picking a preset or a colour shows straight
// away instead of only after the save round-trips.
function previewColors(frm) {
    if (!(window.SwiftTheme && window.SwiftTheme.applyColors)) return;

    if (frm.doc.color_mode === "Custom Colors") {
        window.SwiftTheme.applyColors({
            preset: "",
            primary: frm.doc.primary_color,
            secondary: frm.doc.secondary_color,
            // Without these the preview always derived a Dark/Subtle palette,
            // so switching Custom Mode to Light showed nothing until saved.
            mode: frm.doc.custom_mode,
            strength: frm.doc.custom_strength,
        });
        return;
    }

    const catalog = (frappe.boot.swift_theme && frappe.boot.swift_theme.presets) || [];
    const chosen = catalog.find((p) => p.label === frm.doc.active_preset);
    if (!chosen) return;

    window.SwiftTheme.applyColors({
        preset: chosen.key,
        primary: chosen.primary,
        secondary: chosen.secondary,
        theme_css: chosen.css,
        // Without this the preview cleared data-swift-backdrop, so touching the
        // preset dropdown flattened the background until the page was reloaded.
        backdrop: chosen.backdrop,
    });
}

function reloadTheme() {
    if (window.SwiftTheme && window.SwiftTheme.reload) {
        return Promise.resolve(window.SwiftTheme.reload());
    }
    // Fallback if swift-boot.js hasn't initialised yet.
    return frappe
        .call({ method: "swift_theme.api.boot.get_effective_prefs", freeze: false })
        .then((r) => {
            if (r && r.message && window.SwiftTheme) {
                frappe.boot.swift_theme = r.message;
                window.SwiftTheme.applyPrefs(r.message);
            }
        });
}

function toggleFieldVisibility(frm) {
    const isPreset = frm.doc.color_mode === "Theme Preset";
    const isCustom = frm.doc.color_mode === "Custom Colors";

    frm.toggle_display("active_preset", isPreset);
    frm.toggle_display("primary_color", isCustom);
    frm.toggle_display("secondary_color", isCustom);

    const soundsOn = frm.doc.enable_sounds == 1;
    frm.toggle_display("volume_level", soundsOn);
    frm.toggle_display("sound_events", soundsOn);
}
