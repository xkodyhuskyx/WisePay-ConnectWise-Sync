"use strict";

(() => {
    const STORAGE_KEY = "themePreference";
    const preferences = ["auto", "dark", "light"];
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

    function resolveTheme(preference) {
        return preference === "auto"
            ? colorScheme.matches ? "dark" : "light"
            : preference;
    }

    function applyTheme(preference = "auto") {
        const normalized = preferences.includes(preference)
            ? preference
            : "auto";

        document.documentElement.dataset.themePreference = normalized;
        document.documentElement.dataset.theme = resolveTheme(normalized);
        document.documentElement.style.colorScheme =
            document.documentElement.dataset.theme;
        window.dispatchEvent(new CustomEvent("addonthemechange", {
            detail: { preference: normalized }
        }));
    }

    async function initialize() {
        const stored = await browser.storage.local.get(STORAGE_KEY);
        applyTheme(stored[STORAGE_KEY] || "auto");
    }

    async function setPreference(preference) {
        const normalized = preferences.includes(preference)
            ? preference
            : "auto";
        await browser.storage.local.set({ [STORAGE_KEY]: normalized });
        applyTheme(normalized);
        return normalized;
    }

    async function cycle() {
        const current =
            document.documentElement.dataset.themePreference || "auto";
        const next = preferences[(preferences.indexOf(current) + 1) % preferences.length];
        return setPreference(next);
    }

    colorScheme.addEventListener("change", () => {
        if (document.documentElement.dataset.themePreference === "auto") {
            applyTheme("auto");
        }
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local" && changes[STORAGE_KEY]) {
            applyTheme(changes[STORAGE_KEY].newValue || "auto");
        }
    });

    applyTheme("auto");
    window.addonTheme = { initialize, cycle, setPreference, applyTheme };
    initialize();
})();
