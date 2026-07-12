"use strict";

(() => {
    if (window.__wsgchSourcePopupOverrideInstalled) {
        return;
    }

    window.__wsgchSourcePopupOverrideInstalled = true;
    const originalWindowOpen = window.open;

    window.open = function(url) {
        return originalWindowOpen.call(window, url, "_blank");
    };

    document.addEventListener("click", forceNewTabTarget, true);
    document.addEventListener("submit", forceNewTabTarget, true);

    function forceNewTabTarget(event) {
        const element = event.target instanceof Element
            ? event.target.closest("a[target], form[target]")
            : null;

        if (element && element.target.toLowerCase() !== "_self") {
            element.target = "_blank";
        }
    }
})();
