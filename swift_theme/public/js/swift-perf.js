/* Swift Theme — Performance helpers */

(function () {
    document.addEventListener("DOMContentLoaded", init);

    function init() {
        if (document.documentElement.getAttribute("data-swift-perf") !== "on") return;
        whenIdle(preloadFonts);
        whenIdle(lazyImages);
        whenIdle(hintPaint);
    }
    function whenIdle(fn) {
        if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 1500 });
        else setTimeout(fn, 200);
    }
    /* The faces are served from Google's CDN (see swift-fonts.css), so the
       win here is opening that connection early, not preloading a file.

       This used to preload /assets/swift_theme/fonts/inter-var.woff2, which
       this app has never shipped - public/fonts/README.txt says so in as many
       words. Performance mode is on by default, so every page load fetched
       that path and got a 404. */
    function preloadFonts() {
        try {
            var hosts = ["https://fonts.gstatic.com"];
            hosts.forEach(function (href) {
                if (document.querySelector('link[rel="preconnect"][href="' + href + '"]')) return;
                var l = document.createElement("link");
                l.rel = "preconnect"; l.href = href; l.crossOrigin = "anonymous";
                document.head.appendChild(l);
            });
        } catch (e) {}
    }
    function lazyImages() {
        try {
            document.querySelectorAll("img:not([loading])").forEach(function (img) {
                img.setAttribute("loading", "lazy");
                img.setAttribute("decoding", "async");
            });
        } catch (e) {}
    }
    /* Not on .layout-main-section. will-change: transform makes an element
       the containing block for every position:fixed box inside it - the
       same trap swift-perf.css describes for content-visibility. The page's
       main section holds an open child-table row (position: fixed over a
       backdrop) and the Swift Home artwork (pinned to the viewport); under
       the hint both were laid out against the section instead, and the
       landing's artwork stopped where its content did. */
    function hintPaint() {
        try {
            document.querySelectorAll(".list-row-container").forEach(function (el) {
                el.style.willChange = "transform";
            });
        } catch (e) {}
    }
})();
