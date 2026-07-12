"use strict";

const form = document.getElementById("settings-form");
const passwordForm = document.getElementById("password-form");
const passwordSetupForm = document.getElementById("password-setup-form");
const settingsContainer = document.getElementById("settings-container");
const passwordSetupGate = document.getElementById("password-setup-gate");
const savePasswordDialog = document.getElementById("save-password-dialog");
const savePasswordForm = document.getElementById("save-password-form");
const cancelSavePasswordButton = document.getElementById("cancel-save-password");
const statusElement = document.getElementById("status");
const passwordStatusElement = document.getElementById("password-status");
const testConnectionButton = document.getElementById("test-connection");
const resetAddonButton = document.getElementById("reset-addon");
const popupBehaviorForm = document.getElementById("popup-behavior-form");
const popupToTabEnabled = document.getElementById("popup-to-tab-enabled");
const connectWisePopupUrl = document.getElementById("connectwise-popup-url");
const popupBehaviorStatus = document.getElementById("popup-behavior-status");
const visibilityToggleButtons = document.querySelectorAll(".visibility-toggle");
const themeOptionButtons = document.querySelectorAll("[data-theme-option]");

form.addEventListener("submit", saveSettings);
passwordForm.addEventListener("submit", changePassword);
passwordSetupForm.addEventListener("submit", createInitialPassword);
passwordSetupForm.addEventListener("input", event => {
    if (event.target.matches("input")) {
        clearFieldError(event.target.id);
    }
});
savePasswordForm.addEventListener("input", event => {
    if (event.target.matches("input")) {
        clearFieldError(event.target.id);
    }
});
form.addEventListener("input", event => {
    if (event.target.matches("input")) {
        clearFieldError(event.target.id);
    }
});
passwordForm.addEventListener("input", event => {
    if (event.target.matches("input")) {
        clearFieldError(event.target.id);
    }
});
testConnectionButton.addEventListener("click", testConnection);
resetAddonButton.addEventListener("click", resetAddon);
popupBehaviorForm.addEventListener("submit", savePopupBehavior);
visibilityToggleButtons.forEach(button => {
    button.addEventListener("click", toggleSecretVisibility);
});
themeOptionButtons.forEach(button => {
    button.addEventListener("click", () => {
        window.addonTheme.setPreference(button.dataset.themeOption);
    });
});
window.addEventListener("addonthemechange", updateThemeOptions);

initializeSettingsPage();

async function initializeSettingsPage() {
    const stored = await browser.storage.local.get([
        "encryptedConnectWiseCredentials",
        "encryptedPasswordVerifier",
        "connectWisePopupToTabEnabled",
        "connectWisePopupUrl"
    ]);
    const hasPassword = Boolean(
        stored.encryptedPasswordVerifier ||
        stored.encryptedConnectWiseCredentials
    );

    settingsContainer.classList.remove("password-state-loading");
    settingsContainer.classList.toggle("password-setup-required", !hasPassword);
    passwordSetupGate.hidden = hasPassword;
    popupToTabEnabled.checked =
        stored.connectWisePopupToTabEnabled === true;
    connectWisePopupUrl.value = popupSourceSetting(
        stored.connectWisePopupUrl
    );
    updateThemeOptions();
}

async function savePopupBehavior(event) {
    event.preventDefault();
    clearFieldError("connectwise-popup-url");
    popupBehaviorStatus.textContent = "";
    popupBehaviorStatus.className = "";

    try {
        const normalizedUrl = normalizePopupBehaviorUrl(
            connectWisePopupUrl.value
        );

        if (popupToTabEnabled.checked) {
            const parsedUrl = new URL(normalizedUrl);
            const granted = await browser.permissions.request({
                origins: [`${parsedUrl.origin}/*`]
            });

            if (!granted) {
                throw new Error(
                    "Browser permission is required for this popup source URL."
                );
            }
        }

        await browser.storage.local.set({
            connectWisePopupToTabEnabled: popupToTabEnabled.checked,
            connectWisePopupUrl: normalizedUrl
        });

        connectWisePopupUrl.value = normalizedUrl;
        popupBehaviorStatus.textContent = "Popup behavior saved.";
        popupBehaviorStatus.className = "success";
    } catch (error) {
        setFieldError("connectwise-popup-url", error.message);
        popupBehaviorStatus.textContent =
            "Correct the highlighted URL and try again.";
        popupBehaviorStatus.className = "error";
    }
}

function popupSourceSetting(value) {
    const saved = String(value ?? "").trim();

    if (
        !saved ||
        /^https:\/\/secure2\.wise-sync\.com/i.test(saved)
    ) {
        return "https://na.myconnectwise.net/";
    }

    return saved;
}

function normalizePopupBehaviorUrl(value) {
    const trimmed = String(value ?? "").trim();

    if (!trimmed) {
        throw new Error("Enter a ConnectWise URL.");
    }

    let parsed;

    try {
        parsed = new URL(
            /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
                ? trimmed
                : `https://${trimmed}`
        );
    } catch {
        throw new Error("Enter a valid hostname or HTTPS URL.");
    }

    if (parsed.protocol !== "https:") {
        throw new Error("The ConnectWise URL must use HTTPS.");
    }

    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
}

function updateThemeOptions() {
    const preference =
        document.documentElement.dataset.themePreference || "auto";

    themeOptionButtons.forEach(button => {
        button.setAttribute(
            "aria-pressed",
            String(button.dataset.themeOption === preference)
        );
    });
}

async function createInitialPassword(event) {
    event.preventDefault();
    clearFieldError("setup-password");
    clearFieldError("setup-password-confirmation");
    const password = document.getElementById("setup-password").value;
    const confirmation =
        document.getElementById("setup-password-confirmation").value;

    try {
        if (password.length < 5) {
            setFieldError(
                "setup-password",
                "Use at least 5 characters."
            );
            return;
        }

        if (password !== confirmation) {
            setFieldError(
                "setup-password-confirmation",
                "The passwords do not match."
            );
            return;
        }

        validatePassword(password);
        const verifier = await encryptCredentials(
            { purpose: "password-verifier" },
            password
        );
        await browser.storage.local.set({
            encryptedPasswordVerifier: verifier
        });

        passwordSetupForm.reset();
        resetSecretVisibility();
        settingsContainer.classList.remove("password-setup-required");
        passwordSetupGate.hidden = true;
    } catch (error) {
        setFieldError(
            "setup-password",
            error?.message || "Unable to create the password."
        );
    }
}

async function saveSettings(event) {
    event.preventDefault();
    clearFieldErrors();

    try {
        const credentials = readCredentials();
        validateCredentialValues(credentials);

        const stored = await browser.storage.local.get([
            "encryptedConnectWiseCredentials",
            "encryptedPasswordVerifier"
        ]);
        const encryptedPasswordRecord =
            stored.encryptedPasswordVerifier ||
            stored.encryptedConnectWiseCredentials;

        if (!encryptedPasswordRecord) {
            throw new Error("Create an unlock password before saving.");
        }

        let password;
        let passwordError = "";

        while (!password) {
            password = await requestSavePassword(passwordError);

            if (password === null) {
                return;
            }

            try {
                await decryptCredentials(encryptedPasswordRecord, password);
            } catch (error) {
                passwordError = error.message;
                password = "";
            }
        }

        const encryptedRecord = await encryptCredentials(
            credentials,
            password
        );
        const verifier = await encryptCredentials(
            { purpose: "password-verifier" },
            password
        );

        await browser.storage.local.set({
            encryptedConnectWiseCredentials: encryptedRecord,
            encryptedPasswordVerifier: verifier
        });

        savePasswordForm.reset();
        resetSecretVisibility();

        showStatus("Changes saved successfully.", false);
    } catch (error) {
        showStatus(error.message, true);
    }
}

function requestSavePassword(errorMessage = "") {
    return new Promise(resolve => {
        const input = document.getElementById("save-password");
        input.value = "";
        clearFieldError("save-password");

        if (errorMessage) {
            setFieldError("save-password", errorMessage);
        }

        function cleanup(value) {
            savePasswordForm.removeEventListener("submit", handleSubmit);
            cancelSavePasswordButton.removeEventListener("click", handleCancel);
            savePasswordDialog.removeEventListener("cancel", handleDialogCancel);
            savePasswordDialog.close();
            resolve(value);
        }

        function handleSubmit(event) {
            event.preventDefault();
            const password = input.value;

            if (!password) {
                setFieldError("save-password", "Enter the add-on password.");
                return;
            }

            cleanup(password);
        }

        function handleCancel() {
            cleanup(null);
        }

        function handleDialogCancel(event) {
            event.preventDefault();
            cleanup(null);
        }

        savePasswordForm.addEventListener("submit", handleSubmit);
        cancelSavePasswordButton.addEventListener("click", handleCancel);
        savePasswordDialog.addEventListener("cancel", handleDialogCancel);
        savePasswordDialog.showModal();
        input.focus();
    });
}

async function changePassword(event) {
    event.preventDefault();
    ["current-password", "unlock-password", "confirm-password"]
        .forEach(clearFieldError);

    try {
        const currentPassword =
            document.getElementById("current-password").value;
        const newPassword =
            document.getElementById("unlock-password").value;
        const confirmation =
            document.getElementById("confirm-password").value;

        if (!currentPassword) {
            setFieldError("current-password", "Enter the current password.");
            throw new Error("The current unlock password is required.");
        }

        if (newPassword !== confirmation) {
            setFieldError("confirm-password", "The passwords do not match.");
            throw new Error("The new unlock passwords do not match.");
        }

        try {
            validatePassword(newPassword);
        } catch (error) {
            setFieldError("unlock-password", error.message);
            throw error;
        }

        const stored = await browser.storage.local.get([
            "encryptedConnectWiseCredentials",
            "encryptedPasswordVerifier"
        ]);

        if (
            !stored.encryptedConnectWiseCredentials &&
            !stored.encryptedPasswordVerifier
        ) {
            throw new Error(
                "Create an unlock password before changing it."
            );
        }

        let credentials = null;

        try {
            await decryptCredentials(
                stored.encryptedPasswordVerifier ||
                    stored.encryptedConnectWiseCredentials,
                currentPassword
            );

            if (stored.encryptedConnectWiseCredentials) {
                credentials = await decryptCredentials(
                    stored.encryptedConnectWiseCredentials,
                    currentPassword
                );
            }
        } catch (error) {
            setFieldError("current-password", error.message);
            throw error;
        }
        const verifier = await encryptCredentials(
            { purpose: "password-verifier" },
            newPassword
        );
        const updatedRecords = {
            encryptedPasswordVerifier: verifier
        };

        if (credentials) {
            updatedRecords.encryptedConnectWiseCredentials =
                await encryptCredentials(credentials, newPassword);
        }

        await browser.storage.local.set(updatedRecords);
        await browser.storage.session.clear();

        passwordForm.reset();
        resetSecretVisibility();
        showPasswordStatus(
            "Password changed. Unlock the extension with the new password.",
            false
        );
    } catch (error) {
        showPasswordStatus(error?.message || "Unable to change the password.", true);
    }
}

function readCredentials() {
    return {
        companyId:
            document.getElementById("company-id").value.trim(),
        publicKey:
            document.getElementById("public-key").value.trim(),
        privateKey:
            document.getElementById("private-key").value.trim(),
        clientId:
            document.getElementById("client-id").value.trim(),
        baseUrl:
            document.getElementById("base-url").value.trim()
                .replace(/\/+$/, ""),
        apiPath:
            `/${document.getElementById("api-path").value.trim()
                .replace(/^\/+|\/+$/g, "")}`
    };
}

function validateCredentialValues(credentials) {
    for (const [name, value] of Object.entries(credentials)) {
        if (!value) {
            throw new Error(`${formatName(name)} is required.`);
        }
    }

    let parsedUrl;

    try {
        parsedUrl = new URL(credentials.baseUrl);
    } catch {
        throw new Error("Base URL must be a valid URL.");
    }

    if (parsedUrl.protocol !== "https:") {
        throw new Error("Base URL must use HTTPS.");
    }
}

function formatName(value) {
    return value
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, character => character.toUpperCase());
}

function toggleSecretVisibility(event) {
    const button = event.currentTarget;
    const input = document.getElementById(button.dataset.target);

    if (!input) {
        return;
    }

    const isVisible = input.type === "text";
    input.type = isVisible ? "password" : "text";
    button.textContent = isVisible ? "Show" : "Hide";
    button.setAttribute("aria-pressed", String(!isVisible));
}

function resetSecretVisibility() {
    visibilityToggleButtons.forEach(button => {
        const input = document.getElementById(button.dataset.target);

        if (input) {
            input.type = "password";
        }

        button.textContent = "Show";
        button.setAttribute("aria-pressed", "false");
    });
}

async function testConnection() {
    try {
        clearFieldErrors();
        const credentials = readCredentials();

        if (!validateConnectionFields(credentials)) {
            showStatus("Correct the highlighted fields and try again.", true);
            return;
        }

        setTestConnectionBusy(true);
        showStatus("Testing the ConnectWise connection…", false);

        const url = new URL(
            `${credentials.baseUrl}${credentials.apiPath}/company/companies`
        );
        url.searchParams.set("pageSize", "1");
        url.searchParams.set("fields", "id");

        await ensureConnectWiseHostPermission(url);

        const username =
            `${credentials.companyId}+${credentials.publicKey}`;
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Authorization":
                    `Basic ${btoa(`${username}:${credentials.privateKey}`)}`,
                "clientId": credentials.clientId,
                "Accept":
                    "application/vnd.connectwise.com+json; version=2026.4"
            }
        });

        if (!response.ok) {
            const text = await response.text();
            let message = "";

            try {
                const body = JSON.parse(text);
                message = body?.message || body?.error || body?.code || "";
            } catch {
                message = text;
            }

            markConnectionResponseError(response.status, message);

            throw new Error(
                message || `ConnectWise returned HTTP ${response.status}.`
            );
        }

        showStatus("Connection successful.", false);
    } catch (error) {
        if (error instanceof TypeError) {
            const endpointError =
                "Could not reach this ConnectWise API endpoint. Verify the region URL and API path.";
            setFieldError("base-url", endpointError);
            setFieldError("api-path", endpointError);
            showStatus(
                "The browser could not reach ConnectWise. Check the Base URL, API Path, network connection, and Firefox extension host permission.",
                true
            );
            return;
        }

        showStatus(
            error?.message || "Unable to connect to ConnectWise.",
            true
        );
    } finally {
        setTestConnectionBusy(false);
    }
}

async function ensureConnectWiseHostPermission(url) {
    const origin = `${url.origin}/*`;
    const permissions = { origins: [origin] };
    const granted = await browser.permissions.request(permissions);

    if (!granted) {
        setFieldError(
            "base-url",
            "Firefox permission is required to connect to this host."
        );
        throw new Error(
            "Connection permission was not granted for the ConnectWise API host."
        );
    }
}

function validateConnectionFields(credentials) {
    const fields = {
        companyId: "company-id",
        publicKey: "public-key",
        privateKey: "private-key",
        clientId: "client-id",
        baseUrl: "base-url",
        apiPath: "api-path"
    };
    let valid = true;

    for (const [credentialName, fieldId] of Object.entries(fields)) {
        if (!credentials[credentialName]) {
            setFieldError(fieldId, "This field is required.");
            valid = false;
        }
    }

    if (credentials.baseUrl) {
        try {
            const url = new URL(credentials.baseUrl);

            if (url.protocol !== "https:") {
                setFieldError("base-url", "Use an HTTPS URL.");
                valid = false;
            }
        } catch {
            setFieldError("base-url", "Enter a valid URL.");
            valid = false;
        }
    }

    return valid;
}

function markConnectionResponseError(status, message) {
    const normalizedMessage = String(message ?? "").toLowerCase();

    if (status === 401) {
        const authenticationError =
            "Authentication failed. Verify this credential.";
        setFieldError("company-id", authenticationError);
        setFieldError("public-key", authenticationError);
        setFieldError("private-key", authenticationError);
    }

    if (
        status === 403 ||
        normalizedMessage.includes("clientid") ||
        normalizedMessage.includes("client id")
    ) {
        setFieldError(
            "client-id",
            "Verify the Client ID and the API member's permissions."
        );
    }
}

function setFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);

    if (!field) {
        return;
    }

    const errorId = `${fieldId}-error`;
    let errorElement = document.getElementById(errorId);

    if (!errorElement) {
        errorElement = document.createElement("div");
        errorElement.id = errorId;
        errorElement.className = "field-error";
        errorElement.setAttribute("role", "alert");
        field.closest(".field")?.appendChild(errorElement);
    }

    errorElement.textContent = message;
    field.setAttribute("aria-invalid", "true");
    field.setAttribute("aria-describedby", errorId);
}

function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}-error`);

    errorElement?.remove();
    field?.removeAttribute("aria-invalid");
    field?.removeAttribute("aria-describedby");
}

function clearFieldErrors() {
    form.querySelectorAll(".field-error").forEach(element => element.remove());
    form.querySelectorAll('[aria-invalid="true"]').forEach(field => {
        field.removeAttribute("aria-invalid");
        field.removeAttribute("aria-describedby");
    });
}

function setTestConnectionBusy(busy) {
    testConnectionButton.disabled = busy;
    testConnectionButton.textContent = busy
        ? "Testing…"
        : "Test Connection";
}

async function resetAddon() {
    const confirmed = window.confirm(
        "Reset this add-on? This removes saved credentials, the unlocked session, and all cached ConnectWise data from this Firefox profile."
    );

    if (!confirmed) {
        return;
    }

    await Promise.all([
        browser.storage.local.clear(),
        browser.storage.session.clear()
    ]);

    form.reset();
    passwordForm.reset();
    clearFieldErrors();
    ["current-password", "unlock-password", "confirm-password"]
        .forEach(clearFieldError);
    resetSecretVisibility();
    document.getElementById("base-url").value =
        "https://api-na.myconnectwise.net";
    document.getElementById("api-path").value =
        "/v4_6_release/apis/3.0";

    showStatus("The add-on was reset successfully.", false);
    await initializeSettingsPage();
}

function showStatus(message, isError) {
    statusElement.textContent = message;
    statusElement.className = isError ? "error" : "success";
}

function showPasswordStatus(message, isError) {
    passwordStatusElement.textContent = message;
    passwordStatusElement.className = isError ? "error" : "success";
}
