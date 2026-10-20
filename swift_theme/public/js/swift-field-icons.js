/* Swift Theme — field icons

   An icon inside every field on a DocType form, at the start of the input,
   chosen by the field's type: a chain for Link, a calendar for Date, a clock
   for Time and so on. Icons come from Frappe's own Lucide sprite, so nothing
   is shipped or requested.

   The icon goes in .control-input-wrapper, which holds both the editable
   input and the read-only .control-value, so it stays put when a document is
   submitted. Fields with no plain input box — Check, Color (it already has
   its swatch there), editors, attachments, tables — carry it before the
   label instead.

   Hooked into ControlInput.set_label rather than drawn after the form
   renders. Frappe rewrites the label's innerHTML whenever the label changes
   (set_df_property, refresh_field), which would wipe a label icon added
   once; going through set_label puts it back every time. Tables draw their
   label in Grid.make instead, so ControlTable.refresh_input is wrapped for
   those.

   Form fields only: controls without a frm (dialogs, filters, quick entry)
   are left as Frappe draws them.

   A DocType can name its own icons per field with
   SwiftFieldIcons.register(doctype, { fieldname: "icon" }); anything it does
   not name falls back to the type. */

(function () {
    if (!(window.frappe && frappe.ui && frappe.ui.form && frappe.ui.form.ControlInput)) return;

    var BY_TYPE = {
        "Link":              "link",
        "Dynamic Link":      "link-2",
        "Data":              "text-cursor-input",
        "Autocomplete":      "list-filter",
        "Select":            "list",
        "Check":             "square-check",
        "Date":              "calendar",
        "Datetime":          "calendar-clock",
        "Time":              "clock",
        "Duration":          "timer",
        "Int":               "hash",
        "Float":             "calculator",
        "Currency":          "banknote",
        "Percent":           "percent",
        "Rating":            "star",
        "Color":             "pipette",
        "Attach":            "paperclip",
        "Attach Image":      "image",
        "Signature":         "signature",
        "Barcode":           "barcode",
        "Geolocation":       "map-pin",
        "Password":          "key-round",
        "Phone":             "phone",
        "Small Text":        "text-quote",
        "Text":              "file-text",
        "Long Text":         "file-text",
        "Text Editor":       "file-pen-line",
        "HTML Editor":       "code-xml",
        "Markdown Editor":   "file-code",
        "Code":              "code",
        "JSON":              "braces",
        "Read Only":         "lock",
        "Table":             "table",
        "Table MultiSelect": "tags",
    };

    // A Data field's options say what it holds, and that reads better than
    // the generic text cursor.
    var DATA_OPTIONS = {
        "Email": "mail",
        "Phone": "phone",
        "URL":   "globe",
    };

    var byDoctype = {};

    function iconFor(df, doctype) {
        var own = byDoctype[doctype] || byDoctype[df.parent];
        if (own && own[df.fieldname]) return own[df.fieldname];
        if (df.fieldtype === "Data" && DATA_OPTIONS[df.options]) return DATA_OPTIONS[df.options];
        return BY_TYPE[df.fieldtype];
    }

    // Types drawn as a plain box, editable or read-only, whose start edge is
    // free. Decided by type, not by finding an <input>: a read-only field has
    // none until it becomes editable. Phone (country picker), Color (swatch),
    // Duration and Barcode use that edge or draw their own box, so they keep
    // the icon by the label.
    var INSIDE = {
        "Data": 1, "Link": 1, "Dynamic Link": 1, "Select": 1, "Autocomplete": 1,
        "Date": 1, "Datetime": 1, "Time": 1,
        "Int": 1, "Float": 1, "Currency": 1, "Percent": 1,
        "Password": 1, "Small Text": 1, "Text": 1, "Long Text": 1, "Read Only": 1,
    };

    function prepend(parent, name) {
        if (!parent || !name) return;
        var existing = parent.querySelector(":scope > .swift-field-icon");
        if (existing && existing.getAttribute("data-icon") === name) return;
        if (existing) existing.remove();

        var span = document.createElement("span");
        span.className = "swift-field-icon";
        span.setAttribute("aria-hidden", "true");
        span.setAttribute("data-icon", name);
        span.innerHTML = frappe.utils.icon(name, "sm");
        parent.insertBefore(span, parent.firstChild);
    }

    // The wrapper to draw inside, or null when the field has no plain box.
    function insideTarget(control) {
        if (!INSIDE[control.df.fieldtype] || !control.$input_wrapper) return null;
        return control.$input_wrapper.get(0) || null;
    }

    function decorate(control, label) {
        if (!control.frm || !control.df || !control.df.label) return;
        try {
            var name = iconFor(control.df, control.doctype || control.frm.doctype);
            var inside = insideTarget(control);
            if (inside) {
                inside.classList.add("swift-has-input-icon");
                prepend(inside, name);
            } else {
                prepend(label, name);
            }
        } catch (e) {
            // Frappe's label must keep working even if ours can't.
            console.warn("Swift field icon failed", e);
        }
    }

    var Input = frappe.ui.form.ControlInput;
    if (!Input.prototype.__swiftFieldIcons) {
        Input.prototype.__swiftFieldIcons = true;
        var setLabel = Input.prototype.set_label;
        Input.prototype.set_label = function () {
            var out = setLabel.apply(this, arguments);
            if (!this.only_input) decorate(this, this.label_span);
            return out;
        };
    }

    // refresh_input, not make: the grid draws its label in Grid.make, and
    // that only runs on the grid's first refresh.
    var Table = frappe.ui.form.ControlTable;
    if (Table && !Table.prototype.__swiftFieldIcons) {
        Table.prototype.__swiftFieldIcons = true;
        var refreshInput = Table.prototype.refresh_input;
        Table.prototype.refresh_input = function () {
            var out = refreshInput.apply(this, arguments);
            decorate(this, this.$wrapper && this.$wrapper.find(".grid-field > .control-label").get(0));
            return out;
        };
    }

    window.SwiftFieldIcons = {
        register: function (doctype, map) {
            byDoctype[doctype] = Object.assign(byDoctype[doctype] || {}, map);
        },
        iconFor: iconFor,
    };
})();
