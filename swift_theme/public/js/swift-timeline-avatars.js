/* Swift Theme — user avatars on the Activity timeline

   On every DocType's form, Singles included, an Activity entry Frappe draws
   as a bare dot ("You created this", "Jane changed the value of Status", "viewed this",
   shares, assignments ...) shows the avatar of the user who did it instead.
   A user without a photo gets Frappe's coloured letter avatar. Entries that
   already carry an icon (attachments, comments, emails, likes, workflow) keep
   it — the icon says what happened, the avatar would not.

   Frappe hands the timeline items that know only their time and their HTML,
   not who they belong to. Every one is built from a record that does know —
   the document itself (owner, modified_by) or a docinfo log (versions,
   views, comments ...: owner + creation) — and the item keeps that record's
   timestamp, so the user is found by matching `creation`.

   Takes precedence over the document image (swift-doc-images.js), which
   still fills any dot this cannot put a user on. That works by import order:
   this wraps get_timeline_item after it, so runs first and sets the badge,
   and the image wrapper then leaves a badged item alone. */

(function () {
    if (!(window.frappe && frappe.ui && frappe.ui.BaseTimeline)) return;

    // creation timestamp -> user, from the document and every docinfo log.
    function users_by_time(frm, doc_info) {
        var map = {};
        var doc = frm && frm.doc;
        if (doc) {
            if (doc.creation && doc.owner) map[doc.creation] = doc.owner;
            if (doc.modified && doc.modified_by) map[doc.modified] = doc.modified_by;
        }
        Object.keys(doc_info || {}).forEach(function (key) {
            var list = doc_info[key];
            if (!Array.isArray(list)) return;
            list.forEach(function (row) {
                if (row && row.creation && row.owner && !(row.creation in map)) {
                    map[row.creation] = row.owner;
                }
            });
        });
        return map;
    }

    var Timeline = frappe.ui.BaseTimeline;
    if (Timeline.prototype.__swiftTimelineAvatars) return;
    Timeline.prototype.__swiftTimelineAvatars = true;

    var getItem = Timeline.prototype.get_timeline_item;
    Timeline.prototype.get_timeline_item = function (item) {
        var user = null;
        try {
            // Only entries Frappe would draw as a bare dot.
            if (this.frm && item && item.name !== "load-more" && !item.icon && !item.timeline_badge) {
                var doc = this.frm.doc || {};
                if (item.creation) {
                    var doc_info = this.doc_info || (this.frm.get_docinfo && this.frm.get_docinfo());
                    user = users_by_time(this.frm, doc_info)[item.creation] || null;
                } else if (!doc.creation && doc.owner) {
                    // A Single has no `creation`, so its "created this" entry
                    // carries no timestamp to match. It is the only entry
                    // Frappe builds without one — every other comes from a
                    // docinfo row — so an untimed entry is that one.
                    user = doc.owner;
                }
            }
            if (user) {
                item = Object.assign({}, item, {
                    timeline_badge: '<div class="timeline-badge swift-user-badge"></div>',
                });
            }
        } catch (e) {
            user = null;
            console.warn("Swift timeline avatar failed", e);
        }

        var $item = getItem.call(this, item);
        if (user && $item) {
            // frappe.avatar escapes the image URL and sets the title as an
            // attribute, so a name with quotes cannot break the markup.
            $item.find(".swift-user-badge").append(frappe.avatar(user, "avatar-small"));
        }
        return $item;
    };
})();
