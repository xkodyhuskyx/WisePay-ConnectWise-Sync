"use strict";

const DEFAULT_POPUP_SOURCE = "https://na.myconnectwise.net/";
const POPUP_OVERRIDE_SCRIPT_ID = "connectwise-popup-source-override";
const OBSOLETE_POPUP_SCRIPT_IDS = [
    "connectwise-popup-tab-interceptor",
    "connectwise-popup-tab-bridge"
];
let popupOverrideRefreshQueue = Promise.resolve();

browser.runtime.onInstalled.addListener(schedulePopupOverrideRefresh);
browser.runtime.onStartup.addListener(schedulePopupOverrideRefresh);
browser.storage.onChanged.addListener((changes, areaName) => {
    if (
        areaName === "local" &&
        (changes.connectWisePopupToTabEnabled || changes.connectWisePopupUrl)
    ) {
        schedulePopupOverrideRefresh();
    }
});
browser.tabs.onCreated.addListener(tab => {
    movePopupFromConfiguredSource(tab.id).catch(() => {});
});
browser.tabs.onUpdated.addListener(tabId => {
    movePopupFromConfiguredSource(tabId).catch(() => {});
});

schedulePopupOverrideRefresh();

function schedulePopupOverrideRefresh() {
    popupOverrideRefreshQueue = popupOverrideRefreshQueue
        .catch(() => {})
        .then(refreshPopupOverride)
        .catch(error => {
            console.error("Unable to update popup behavior:", error);
        });
    return popupOverrideRefreshQueue;
}

async function refreshPopupOverride() {
    const removableIds = [
        POPUP_OVERRIDE_SCRIPT_ID,
        ...OBSOLETE_POPUP_SCRIPT_IDS
    ];
    const scripts = await browser.scripting.getRegisteredContentScripts({
        ids: removableIds
    });

    if (scripts.length > 0) {
        await browser.scripting.unregisterContentScripts({
            ids: scripts.map(script => script.id)
        });
    }

    const settings = await popupSourceSettings();

    if (!settings.enabled) {
        return;
    }

    const matchPattern = popupSourceMatchPattern(settings.url);
    const hasPermission = await browser.permissions.contains({
        origins: [matchPattern]
    });

    if (!hasPermission) {
        return;
    }

    await browser.scripting.registerContentScripts([{
        id: POPUP_OVERRIDE_SCRIPT_ID,
        matches: [matchPattern],
        js: ["content/open-source-popups-as-tabs.js"],
        runAt: "document_start",
        world: "MAIN",
        allFrames: true,
        matchOriginAsFallback: true
    }]);
}

async function movePopupFromConfiguredSource(tabId) {
    const settings = await popupSourceSettings();

    if (!settings.enabled) {
        return;
    }

    const tab = await browser.tabs.get(tabId);

    if (!Number.isInteger(tab.openerTabId)) {
        return;
    }

    const popupWindow = await browser.windows.get(tab.windowId);

    if (popupWindow.type !== "popup") {
        return;
    }

    const openerTab = await browser.tabs.get(tab.openerTabId);

    if (!matchesPopupSource(openerTab.url, settings.url)) {
        return;
    }

    const normalWindows = await browser.windows.getAll({
        windowTypes: ["normal"]
    });
    const targetWindow = normalWindows.find(window => window.focused) ||
        normalWindows.find(window => window.id === openerTab.windowId) ||
        normalWindows.at(-1);

    if (!targetWindow) {
        return;
    }

    await browser.tabs.move(tabId, {
        windowId: targetWindow.id,
        index: -1
    });
    await browser.windows.update(targetWindow.id, { focused: true });
}

async function popupSourceSettings() {
    const stored = await browser.storage.local.get({
        connectWisePopupToTabEnabled: false,
        connectWisePopupUrl: DEFAULT_POPUP_SOURCE
    });
    const saved = String(stored.connectWisePopupUrl ?? "").trim();
    const url = !saved || /^https:\/\/secure2\.wise-sync\.com/i.test(saved)
        ? DEFAULT_POPUP_SOURCE
        : saved;

    return {
        enabled: stored.connectWisePopupToTabEnabled === true,
        url
    };
}

function popupSourceMatchPattern(value) {
    const parsed = new URL(normalizePopupUrl(value));
    const path = parsed.pathname === "/"
        ? "/*"
        : `${parsed.pathname.replace(/\/$/, "")}*`;
    return `${parsed.protocol}//${parsed.host}${path}`;
}

function matchesPopupSource(candidateValue, configuredValue) {
    try {
        const candidate = new URL(String(candidateValue ?? ""));
        const configured = new URL(normalizePopupUrl(configuredValue));
        const path = configured.pathname.replace(/\/$/, "");

        return candidate.origin === configured.origin &&
            (!path || candidate.pathname === path ||
                candidate.pathname.startsWith(`${path}/`));
    } catch {
        return false;
    }
}

function normalizePopupUrl(value) {
    const trimmed = String(value ?? "").trim();
    return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
}
