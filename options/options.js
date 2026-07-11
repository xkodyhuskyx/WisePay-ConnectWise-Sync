"use strict";

const form = document.getElementById("settings-form");
const statusElement = document.getElementById("status");
const showSecretsCheckbox = document.getElementById("show-secrets");
const clearSettingsButton = document.getElementById("clear-settings");

form.addEventListener("submit", saveSettings);
showSecretsCheckbox.addEventListener("change", toggleSecretVisibility);
clearSettingsButton.addEventListener("click", clearSettings);

async function saveSettings(event) {
    event.preventDefault();

    try {
        const credentials = readCredentials();
        const password =
            document.getElementById("unlock-password").value;
        const confirmation =
            document.getElementById("confirm-password").value;

        if (password !== confirmation) {
            throw new Error("The unlock passwords do not match.");
        }

        validateCredentialValues(credentials);

        const encryptedRecord = await encryptCredentials(
            credentials,
            password
        );

        await browser.storage.local.set({
            encryptedConnectWiseCredentials: encryptedRecord
        });

        document.getElementById("unlock-password").value = "";
        document.getElementById("confirm-password").value = "";

        showStatus("Encrypted settings saved successfully.", false);
    } catch (error) {
        showStatus(error.message, true);
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

function toggleSecretVisibility() {
    const type = showSecretsCheckbox.checked ? "text" : "password";

    document.getElementById("private-key").type = type;
    document.getElementById("unlock-password").type = type;
    document.getElementById("confirm-password").type = type;
}

async function clearSettings() {
    const confirmed = window.confirm(
        "Remove the encrypted ConnectWise credentials from this Firefox profile?"
    );

    if (!confirmed) {
        return;
    }

    await browser.storage.local.remove(
        "encryptedConnectWiseCredentials"
    );

    form.reset();
    document.getElementById("base-url").value =
        "https://na.myconnectwise.net";
    document.getElementById("api-path").value =
        "/v4_6_release/apis/3.0";

    showStatus("Saved settings were removed.", false);
}

function showStatus(message, isError) {
    statusElement.textContent = message;
    statusElement.className = isError ? "error" : "success";
}
