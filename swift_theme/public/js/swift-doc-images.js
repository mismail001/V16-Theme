/* Swift Theme — document images

   A DocType with an image field (meta.image_field: Item's image, User's
   user_image, Employee's image ...) shows that image as a square thumbnail:

   * in its list, between the checkbox and the title. A row whose document
     has no image gets a square with its first letter instead, so titles
     stay lined up;
   * in the form's Activity timeline, in place of the plain dot on entries
     such as "You created this" and "You last edited this". Entries that
     already carry an icon (attachments, comments, emails) keep it — the
     icon says what happened, the image would not.

   Both wrap Frappe's own builders rather than replace them:
   ListView.get_subject_element and BaseTimeline.get_timeline_item, which
   FormTimeline inherits. Frappe already fetches the image field for the
   list (ListView.set_fields), so this adds no request. */

(function () {
    if (!(window.frappe && frappe.views && frappe.views.ListView && frappe.ui && frappe.ui.BaseTimeline)) return;

    // DOM-built, so a URL or title with quotes cannot break out of the
    // attribute it is put in.
    function thumb(url, title, cls) {
        var box = document.createElement("span");
        box.className = cls;
        box.setAttribute("aria-hidden", "true");
        if (url) {
            var img = document.createElement("img");
            img.loading = "lazy";
            img.alt = "";
            img.src = url;
            box.setAttribute("data-initial", initial(title));
            box.appendChild(img);
        } else {
            box.classList.add("swift-doc-thumb--letter");
            box.textContent = initial(title);
        }
        return box;
    }

    function initial(title) {
        var s = String(title || "").trim();
        return s ? s.charAt(0).toUpperCase() : "·";
    }

    // A missing file shows the letter, not a broken-image icon. One listener
    // on the document, not onerror on each image: the list hands Frappe its
    // subject as an HTML string (get_subject_element(...).innerHTML), which
    // drops any handler set on the element. Capture phase, because error
    // does not bubble.
    document.addEventListener("error", function (e) {
        var img = e.target;
        if (!img || img.tagName !== "IMG" || !img.parentElement) return;
        var box = img.parentElement;
        if (!box.classList.contains("swift-doc-thumb")) return;
        box.classList.add("swift-doc-thumb--letter");
        box.textContent = box.getAttribute("data-initial") || "·";
    }, true);

    /* ---- List ---------------------------------------------------------- */

    var List = frappe.views.ListView;
    if (!List.prototype.__swiftDocImages) {
        List.prototype.__swiftDocImages = true;
        var getSubject = List.prototype.get_subject_element;
        List.prototype.get_subject_element = function (doc, title) {
            var div = getSubject.apply(this, arguments);
            try {
                if (this.meta && this.meta.image_field && div) {
                    var url = this.get_image_url(doc);
                    var label = this.get_subject_text(doc, title);
                    var box = thumb(url, frappe.utils.html2text(String(label || doc.name)), "swift-doc-thumb level-item");
                    // After the checkbox cell, before the title.
                    var check = div.firstElementChild;
                    div.insertBefore(box, check ? check.nextSibling : div.firstChild);
                }
            } catch (e) {
                // Frappe's row must keep working even if ours can't.
                console.warn("Swift list thumbnail failed", e);
            }
            return div;
        };
    }

    /* ---- Form Activity timeline ---------------------------------------- */

    var Timeline = frappe.ui.BaseTimeline;
    if (!Timeline.prototype.__swiftDocImages) {
        Timeline.prototype.__swiftDocImages = true;
        var getItem = Timeline.prototype.get_timeline_item;
        Timeline.prototype.get_timeline_item = function (item) {
            var url = null;
            var frm = this.frm;
            try {
                var field = frm && frm.meta && frm.meta.image_field;
                url = field && frm.doc && frm.doc[field];
                // Only entries Frappe would draw as a bare dot. The badge goes
                // in empty and the image is attached as a node afterwards.
                if (url && item && item.name !== "load-more" && !item.icon && !item.timeline_badge) {
                    item = Object.assign({}, item, {
                        timeline_badge: '<div class="timeline-badge swift-doc-badge"></div>',
                    });
                } else {
                    url = null;
                }
            } catch (e) {
                url = null;
                console.warn("Swift timeline image failed", e);
            }

            var $item = getItem.call(this, item);
            if (url && $item) {
                var title = frm.get_title ? frm.get_title() : frm.docname;
                $item.find(".swift-doc-badge").append(thumb(url, title, "swift-doc-thumb"));
            }
            return $item;
        };
    }
})();
