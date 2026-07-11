"use strict";

const popupTitle = document.getElementById("popup-title");
const companyNameElement = document.getElementById("company-name");
const unlockSection = document.getElementById("unlock-section");
const unlockedSection = document.getElementById("unlocked-section");
const unsupportedSection = document.getElementById("unsupported-section");
const unlockPasswordInput = document.getElementById("unlock-password");
const unlockButton = document.getElementById("unlock-button");
const lockExtensionButton = document.getElementById("lock-extension");
const openSettingsButton = document.getElementById("open-settings");
const statusElement = document.getElementById("status");
const contactsSection = document.getElementById("contacts-section");
const contactsList = document.getElementById("contacts-list");
const contactCount = document.getElementById("contact-count");
const listHeading = document.getElementById("list-heading");
const contactSearchContainer = document.getElementById("contact-search-container");
const contactSearchInput = document.getElementById("contact-search");

let activeWiseSyncTabId = null;
let currentPageMode = "unsupported";
let sessionCredentials = null;
let cachedCompanyName = null;
let lastFilledContact = null;
let loadedItems = [];
let cachedCompanyRecord = null;
let cachedContacts = null;
let cachedAddresses = null;

document.addEventListener("DOMContentLoaded", initializePopup);
unlockButton.addEventListener("click", unlockAndAutoLoad);
unlockPasswordInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        unlockAndAutoLoad();
    }
});
lockExtensionButton.addEventListener("click", lockExtension);
openSettingsButton.addEventListener("click", () => browser.runtime.openOptionsPage());
contactSearchInput.addEventListener("input", filterDisplayedItems);

async function initializePopup() {
    await restoreSessionState();
    await detectCurrentPageMode();
    applyPageMode();

    if (currentPageMode === "unsupported") {
        setUnsupportedState();
        return;
    }

    if (sessionCredentials) {
        await autoLoadCurrentMode();
    } else {
        setLockedState();
    }
}

async function restoreSessionState() {
    const stored = await browser.storage.session.get([
        "unlockedConnectWiseCredentials",
        "cachedWiseSyncCompanyName",
        "lastFilledConnectWiseContact",
        "cachedConnectWiseCompanyRecord",
        "cachedConnectWiseContacts",
        "cachedConnectWiseAddresses"
    ]);

    if (stored.unlockedConnectWiseCredentials) {
        validateCredentials(stored.unlockedConnectWiseCredentials);
        sessionCredentials = stored.unlockedConnectWiseCredentials;
    }

    if (stored.cachedWiseSyncCompanyName) {
        cachedCompanyName = String(stored.cachedWiseSyncCompanyName).trim();
    }

    if (stored.lastFilledConnectWiseContact) {
        lastFilledContact = stored.lastFilledConnectWiseContact;
    }

    if (stored.cachedConnectWiseCompanyRecord) {
        cachedCompanyRecord = stored.cachedConnectWiseCompanyRecord;
    }

    if (Array.isArray(stored.cachedConnectWiseContacts)) {
        cachedContacts = stored.cachedConnectWiseContacts;
    }

    if (Array.isArray(stored.cachedConnectWiseAddresses)) {
        cachedAddresses = stored.cachedConnectWiseAddresses;
    }
}

async function detectCurrentPageMode() {
    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true
    });

    const tab = tabs[0];

    if (!tab?.id || !tab.url || !isSupportedWiseSyncUrl(tab.url)) {
        currentPageMode = "unsupported";
        return;
    }

    activeWiseSyncTabId = tab.id;

    const results = await browser.scripting.executeScript({
        target: {
            tabId: tab.id,
            allFrames: true
        },
        func: detectWiseSyncPageModeWithRetry,
        args: [750]
    });

    const result = results.find(item => item.result?.mode);
    currentPageMode = result?.result?.mode ?? "unsupported";
}

async function detectWiseSyncPageModeWithRetry(retryDelayMs) {
    function detectMode() {
        const companyField =
            document.querySelector('[label="Company"]') ||
            document.querySelector('[aria-label="Company"]') ||
            Array.from(document.querySelectorAll("label"))
                .find(label =>
                    String(label.textContent ?? "")
                        .replace(/[:*]+$/g, "")
                        .trim()
                        .toLowerCase() === "company"
                );

        const billingField = document.querySelector(
            '[data-auto-id="npe-payment-details-billing-street-address"]'
        );

        if (companyField) {
            return "contact";
        }

        if (billingField) {
            return "billing";
        }

        return null;
    }

    const immediateMode = detectMode();

    if (immediateMode) {
        return {
            mode: immediateMode,
            attempt: 1
        };
    }

    await new Promise(resolve =>
        window.setTimeout(resolve, retryDelayMs)
    );

    const retryMode = detectMode();

    return {
        mode: retryMode ?? "unsupported",
        attempt: 2
    };
}

function applyPageMode() {
    contactsSection.hidden = true;
    unsupportedSection.hidden = true;
    statusElement.textContent = "";
    statusElement.className = "";

    if (currentPageMode === "contact") {
        popupTitle.textContent = "ConnectWise Contacts";
        companyNameElement.textContent = cachedCompanyName
            ? `Last company: ${cachedCompanyName}`
            : "Reading the company from Wise-Sync…";
        listHeading.textContent = "Contacts";
        contactSearchInput.placeholder = "Search contacts";
    } else if (currentPageMode === "billing") {
        popupTitle.textContent = "ConnectWise Billing Addresses";
        companyNameElement.textContent = cachedCompanyName
            ? `Company: ${cachedCompanyName}`
            : "No cached company is available.";
        listHeading.textContent = "Addresses";
        contactSearchInput.placeholder =
            "Search by site, street, city, state, or ZIP";
    } else {
        popupTitle.textContent = "Wise-Sync Guest Checkout Helper";
        companyNameElement.textContent = "This page is not supported.";
    }
}

function setLockedState() {
    unlockSection.hidden = false;
    unlockedSection.hidden = true;
    unsupportedSection.hidden = true;
    contactsSection.hidden = true;
    showStatus("Unlock the extension to load information.");
}

function setUnlockedState() {
    unlockSection.hidden = true;
    unlockedSection.hidden = false;
    unsupportedSection.hidden = true;
}

function setUnsupportedState() {
    unsupportedSection.hidden = false;
    contactsSection.hidden = true;

    if (sessionCredentials) {
        unlockSection.hidden = true;
        unlockedSection.hidden = false;
        showStatus(
            "The extension is unlocked, but the add-on cannot be used on this page.",
            true
        );
    } else {
        unlockSection.hidden = false;
        unlockedSection.hidden = true;
        showStatus(
            "The extension is locked, and the add-on cannot be used on this page.",
            true
        );
    }
}

async function unlockAndAutoLoad() {
    const password = unlockPasswordInput.value;

    if (!password) {
        showStatus("Enter your unlock password.", true);
        return;
    }

    try {
        setBusy(true);
        const credentials = await unlockStoredCredentials(password);

        await browser.storage.session.set({
            unlockedConnectWiseCredentials: credentials
        });

        sessionCredentials = credentials;
        unlockPasswordInput.value = "";

        if (currentPageMode === "unsupported") {
            setUnsupportedState();
        } else {
            setUnlockedState();
            await autoLoadCurrentMode();
        }
    } catch (error) {
        showStatus(error?.message || "Unable to unlock the extension.", true);
    } finally {
        setBusy(false);
    }
}

async function lockExtension() {
    await browser.storage.session.remove("unlockedConnectWiseCredentials");
    sessionCredentials = null;
    loadedItems = [];
    contactsList.replaceChildren();
    contactsSection.hidden = true;

    if (currentPageMode === "unsupported") {
        setUnsupportedState();
    } else {
        setLockedState();
    }
}

async function autoLoadCurrentMode() {
    if (!sessionCredentials) {
        setLockedState();
        return;
    }

    setUnlockedState();

    if (currentPageMode === "contact") {
        await loadContactsAutomatically();
    } else if (currentPageMode === "billing") {
        await loadAddressesAutomatically();
    } else {
        setUnsupportedState();
    }
}

async function loadContactsAutomatically() {
    showStatus("Reading the company from Wise-Sync…");

    try {
        const companyName = await readCompanyNameFromPage();

        if (
            companyName &&
            normalizeComparison(companyName) !==
                normalizeComparison(cachedCompanyName)
        ) {
            cachedCompanyName = companyName;
            cachedCompanyRecord = null;
            cachedContacts = null;
            cachedAddresses = null;

            await browser.storage.session.set({
                cachedWiseSyncCompanyName: companyName
            });

            await browser.storage.session.remove([
                "cachedConnectWiseCompanyRecord",
                "cachedConnectWiseContacts",
                "cachedConnectWiseAddresses"
            ]);
        }

        companyNameElement.textContent = `Wise-Sync company: ${companyName}`;
        showStatus("Loading ConnectWise contacts…");

        const company = await getCachedOrLookupCompany(
            companyName,
            sessionCredentials
        );

        const contacts = await getCachedOrLoadContacts(
            company.id,
            sessionCredentials
        );

        displayContacts(contacts, company);
        showStatus(
            `Loaded ${contacts.length} contact${contacts.length === 1 ? "" : "s"}.`,
            false,
            true
        );
    } catch (error) {
        showStatus(error?.message || "Unable to load contacts.", true);
    }
}

async function loadAddressesAutomatically() {
    if (!cachedCompanyName) {
        showStatus(
            "No company is cached. Fill a contact on the previous Wise-Sync page first.",
            true
        );
        return;
    }

    if (!lastFilledContact) {
        showStatus(
            "No contact is cached. Fill a contact on the previous page first.",
            true
        );
        return;
    }

    try {
        companyNameElement.textContent = `Company: ${cachedCompanyName}`;
        showStatus("Loading company addresses from ConnectWise…");

        const company = await getCachedOrLookupCompany(
            cachedCompanyName,
            sessionCredentials
        );

        const addresses = await getCachedOrLoadAddresses(
            company,
            sessionCredentials
        );

        displayAddresses(addresses, company);
        showStatus(
            `Loaded ${addresses.length} address${addresses.length === 1 ? "" : "es"}.`,
            false,
            true
        );
    } catch (error) {
        showStatus(error?.message || "Unable to load addresses.", true);
    }
}

async function unlockStoredCredentials(password) {
    const stored = await browser.storage.local.get(
        "encryptedConnectWiseCredentials"
    );

    if (!stored.encryptedConnectWiseCredentials) {
        throw new Error(
            "ConnectWise credentials have not been configured. Open Extension Settings first."
        );
    }

    const credentials = await decryptCredentials(
        stored.encryptedConnectWiseCredentials,
        password
    );

    validateCredentials(credentials);
    return credentials;
}

function validateCredentials(credentials) {
    const required = [
        "companyId",
        "publicKey",
        "privateKey",
        "clientId",
        "baseUrl",
        "apiPath"
    ];

    const missing = required.filter(
        key => !String(credentials?.[key] ?? "").trim()
    );

    if (missing.length > 0) {
        throw new Error(
            `The saved credentials are incomplete: ${missing.join(", ")}.`
        );
    }
}

async function readCompanyNameFromPage() {
    const results = await browser.scripting.executeScript({
        target: {
            tabId: activeWiseSyncTabId,
            allFrames: true
        },
        func: readCompanyFieldFromPage
    });

    const successful = results.find(
        result => result.result?.success && result.result?.companyName
    );

    if (successful) {
        return String(successful.result.companyName).trim();
    }

    throw new Error(
        'A field labeled "Company" could not be found.'
    );
}

function readCompanyFieldFromPage() {
    function normalize(value) {
        return String(value ?? "")
            .replace(/\s+/g, " ")
            .replace(/[:*]+$/g, "")
            .trim()
            .toLowerCase();
    }

    function getValue(element) {
        if (!element) {
            return "";
        }

        if ("value" in element) {
            return String(element.value ?? "").trim();
        }

        return String(
            element.getAttribute("value") ??
            element.textContent ??
            ""
        ).trim();
    }

    const directSelectors = [
        'input[type="text"][label="Company"]',
        'input[type="text"][aria-label="Company"]',
        'input[type="text"][name="Company"]',
        'input[type="text"][name="company"]',
        'input[label="Company"]',
        'input[aria-label="Company"]',
        'div[type="text"][label="Company"]',
        'div[type="text"][aria-label="Company"]'
    ];

    for (const selector of directSelectors) {
        const field = document.querySelector(selector);
        const value = getValue(field);

        if (value) {
            return { success: true, companyName: value };
        }
    }

    for (const label of document.querySelectorAll("label")) {
        if (normalize(label.textContent) !== "company") {
            continue;
        }

        const forId = label.getAttribute("for");

        if (forId) {
            const value = getValue(document.getElementById(forId));

            if (value) {
                return { success: true, companyName: value };
            }
        }

        const container =
            label.closest(".form-group") ||
            label.closest("[class*='field']") ||
            label.parentElement;

        const field = container?.querySelector(
            'input:not([type="hidden"]), textarea, select, div[type="text"]'
        );

        const value = getValue(field);

        if (value) {
            return { success: true, companyName: value };
        }
    }

    return { success: false };
}

function isSupportedWiseSyncUrl(url) {
    try {
        const parsed = new URL(url);

        return (
            parsed.protocol === "https:" &&
            parsed.hostname === "secure2.wise-sync.com" &&
            (
                parsed.pathname === "/npe" ||
                parsed.pathname === "/npe/"
            )
        );
    } catch {
        return false;
    }
}

async function getCachedOrLookupCompany(companyName, credentials) {
    if (
        cachedCompanyRecord &&
        (
            normalizeComparison(cachedCompanyRecord.name) ===
                normalizeComparison(companyName) ||
            normalizeComparison(cachedCompanyRecord.identifier) ===
                normalizeComparison(companyName)
        )
    ) {
        return cachedCompanyRecord;
    }

    const company = await findConnectWiseCompany(
        companyName,
        credentials
    );

    cachedCompanyRecord = company;

    await browser.storage.session.set({
        cachedConnectWiseCompanyRecord: company
    });

    return company;
}

async function findConnectWiseCompany(companyName, credentials) {
    const escaped = escapeConnectWiseCondition(companyName);

    let companies = await connectWiseGet(
        "/company/companies",
        {
            conditions:
                `(name="${escaped}" OR identifier="${escaped}")`,
            fields:
                "id,name,identifier,status,addressLine1,addressLine2,city,state,zip,country",
            pageSize: 25
        },
        credentials
    );

    if (!Array.isArray(companies)) {
        companies = [];
    }

    const matches = companies.filter(company =>
        normalizeComparison(company.name) ===
            normalizeComparison(companyName) ||
        normalizeComparison(company.identifier) ===
            normalizeComparison(companyName)
    );

    if (matches.length === 0) {
        throw new Error(
            `No ConnectWise company matched "${companyName}".`
        );
    }

    if (matches.length > 1) {
        throw new Error(
            `Multiple ConnectWise companies matched "${companyName}".`
        );
    }

    return matches[0];
}

async function getCachedOrLoadContacts(companyId, credentials) {
    if (Array.isArray(cachedContacts)) {
        return cachedContacts;
    }

    const contacts = await getCompanyContacts(
        companyId,
        credentials
    );

    cachedContacts = contacts;

    await browser.storage.session.set({
        cachedConnectWiseContacts: contacts
    });

    return contacts;
}

async function getCompanyContacts(companyId, credentials) {
    let contacts = await connectWiseGet(
        "/company/contacts",
        {
            conditions: `company/id=${Number(companyId)}`,
            fields: [
                "id",
                "firstName",
                "lastName",
                "inactiveFlag",
                "defaultPhoneNbr",
                "defaultPhoneExtension",
                "communicationItems"
            ].join(","),
            orderBy: "lastName asc, firstName asc",
            pageSize: 100
        },
        credentials
    );

    if (!Array.isArray(contacts)) {
        contacts = [];
    }

    return contacts
        .filter(contact => contact.inactiveFlag !== true)
        .map(normalizeContactCommunication);
}

function normalizeContactCommunication(contact) {
    const items = Array.isArray(contact.communicationItems)
        ? contact.communicationItems
        : [];

    const emailItems = items.filter(
        item => normalizeCommunicationType(item) === "email"
    );

    const phoneItems = items.filter(
        item => normalizeCommunicationType(item) === "phone"
    );

    const emailItem =
        emailItems.find(item => item.defaultFlag === true) ??
        emailItems[0] ??
        null;

    const phoneItem =
        phoneItems.find(item => item.defaultFlag === true) ??
        phoneItems[0] ??
        null;

    return {
        ...contact,
        emailAddress: String(emailItem?.value ?? "").trim(),
        phoneNumber: String(
            phoneItem?.value ??
            contact.defaultPhoneNbr ??
            ""
        ).trim(),
        phoneExtension: String(
            phoneItem?.extension ??
            contact.defaultPhoneExtension ??
            ""
        ).trim()
    };
}

function normalizeCommunicationType(item) {
    const explicit = String(item?.communicationType ?? "")
        .trim()
        .toLowerCase();

    if (explicit) {
        return explicit;
    }

    const typeName = String(
        item?.type?.name ??
        item?.type?.description ??
        ""
    )
        .trim()
        .toLowerCase();

    if (typeName.includes("email")) {
        return "email";
    }

    if (
        typeName.includes("phone") ||
        typeName.includes("mobile") ||
        typeName.includes("cell") ||
        typeName.includes("office") ||
        typeName.includes("home")
    ) {
        return "phone";
    }

    return typeName;
}

async function getCachedOrLoadAddresses(company, credentials) {
    if (Array.isArray(cachedAddresses)) {
        return cachedAddresses;
    }

    const addresses = await getCompanyAddresses(
        company,
        credentials
    );

    cachedAddresses = addresses;

    await browser.storage.session.set({
        cachedConnectWiseAddresses: addresses
    });

    return addresses;
}

async function getCompanyAddresses(company, credentials) {
    let sites = await connectWiseGet(
        `/company/companies/${Number(company.id)}/sites`,
        {
            fields: [
                "id",
                "name",
                "addressLine1",
                "addressLine2",
                "city",
                "stateReference",
                "zip",
                "country",
                "primaryAddressFlag",
                "defaultBillingFlag",
                "inactiveFlag"
            ].join(","),
            orderBy: "name asc",
            pageSize: 100
        },
        credentials
    );

    if (!Array.isArray(sites)) {
        sites = [];
    }

    const addresses = [];

    const main = normalizeAddress({
        id: `company-${company.id}`,
        name: "Company Main Address",
        addressLine1: company.addressLine1,
        addressLine2: company.addressLine2,
        city: company.city,
        state: company.state,
        zip: company.zip,
        country: company.country,
        primaryAddressFlag: true
    });

    if (hasUsableAddress(main)) {
        addresses.push(main);
    }

    for (const site of sites) {
        if (site.inactiveFlag !== true) {
            const address = normalizeAddress(site);

            if (hasUsableAddress(address)) {
                addresses.push(address);
            }
        }
    }

    const seen = new Set();

    return addresses
        .filter(address => {
            const key = [
                address.addressLine1,
                address.addressLine2,
                address.city,
                address.state,
                address.zip
            ]
                .map(normalizeComparison)
                .join("|");

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        })
        .sort((a, b) => {
            const aPriority =
                (a.defaultBillingFlag ? 0 : 2) +
                (a.primaryAddressFlag ? 0 : 1);

            const bPriority =
                (b.defaultBillingFlag ? 0 : 2) +
                (b.primaryAddressFlag ? 0 : 1);

            return aPriority - bPriority ||
                String(a.name).localeCompare(String(b.name));
        });
}

function normalizeAddress(source) {
    return {
        id: source.id,
        name: source.name || "Address",
        addressLine1: String(source.addressLine1 ?? "").trim(),
        addressLine2: String(source.addressLine2 ?? "").trim(),
        city: String(source.city ?? "").trim(),
        state: getFullStateName(
            source.stateReference?.name ??
            source.stateReference?.identifier ??
            source.state ??
            ""
        ),
        zip: String(source.zip ?? "").trim(),
        country: "United States",
        primaryAddressFlag: source.primaryAddressFlag === true,
        defaultBillingFlag: source.defaultBillingFlag === true
    };
}

function hasUsableAddress(address) {
    return Boolean(
        address.addressLine1 ||
        address.city ||
        address.state ||
        address.zip
    );
}

function getFullStateName(value) {
    const states = {
        AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
        CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
        FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
        IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
        KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
        MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
        MS: "Mississippi", MO: "Missouri", MT: "Montana",
        NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
        NJ: "New Jersey", NM: "New Mexico", NY: "New York",
        NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
        OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
        RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
        TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
        VA: "Virginia", WA: "Washington", WV: "West Virginia",
        WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia"
    };

    const raw = String(value ?? "").trim();
    return states[raw.toUpperCase()] ?? raw;
}

async function connectWiseGet(endpoint, query, credentials) {
    const baseUrl = String(credentials.baseUrl).replace(/\/+$/, "");
    const apiPath =
        `/${String(credentials.apiPath).replace(/^\/+|\/+$/g, "")}`;
    const endpointPath =
        `/${String(endpoint).replace(/^\/+/, "")}`;

    const url = new URL(`${baseUrl}${apiPath}${endpointPath}`);

    for (const [name, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(name, String(value));
        }
    }

    const username =
        `${credentials.companyId}+${credentials.publicKey}`;

    const requestMethod = "GET";

    if (requestMethod !== "GET") {
        throw new Error(
            "This extension is restricted to read-only ConnectWise API requests."
        );
    }

    const response = await fetch(url.toString(), {
        method: requestMethod,
        headers: {
            "Authorization":
                `Basic ${btoa(`${username}:${credentials.privateKey}`)}`,
            "clientId": credentials.clientId,
            "Accept":
                "application/vnd.connectwise.com+json; version=2026.4"
        }
    });

    const text = await response.text();
    let body = null;

    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
    }

    if (!response.ok) {
        throw new Error(
            body?.message ||
            body?.code ||
            body?.error ||
            `ConnectWise returned HTTP ${response.status}.`
        );
    }

    return body;
}

function displayContacts(contacts, company) {
    loadedItems = contacts;
    contactsSection.hidden = false;
    contactCount.textContent = `${contacts.length} found`;
    companyNameElement.textContent =
        `${company.name}${company.identifier ? ` (${company.identifier})` : ""}`;
    contactSearchContainer.hidden = contacts.length <= 4;
    contactSearchInput.value = "";
    renderContacts(contacts);
}

function renderContacts(contacts) {
    contactsList.replaceChildren();

    if (contacts.length === 0) {
        renderEmpty("No active contacts were found.");
        return;
    }

    for (const contact of contacts) {
        contactsList.appendChild(createContactCard(contact));
    }
}

function createContactCard(contact) {
    const card = document.createElement("article");
    card.className = "contact-card";

    const names = document.createElement("div");
    names.className = "contact-name-grid";
    names.append(
        createContactField("First Name", contact.firstName || "—"),
        createContactField("Last Name", contact.lastName || "—")
    );

    const button = document.createElement("button");
    button.type = "button";
    button.className = "use-contact-button";
    button.textContent = "Fill";
    button.addEventListener("click", () => useContact(contact, button));

    card.append(names, button);
    return card;
}

function displayAddresses(addresses, company) {
    loadedItems = addresses;
    contactsSection.hidden = false;
    contactCount.textContent = `${addresses.length} found`;
    companyNameElement.textContent = `${company.name} — Billing Addresses`;
    contactSearchContainer.hidden = addresses.length <= 4;
    contactSearchInput.value = "";
    renderAddresses(addresses);
}

function renderAddresses(addresses) {
    contactsList.replaceChildren();

    if (addresses.length === 0) {
        renderEmpty("No active company addresses were found.");
        return;
    }

    for (const address of addresses) {
        contactsList.appendChild(createAddressCard(address));
    }
}

function createAddressCard(address) {
    const card = document.createElement("article");
    card.className = "contact-card address-card";

    const details = document.createElement("div");
    details.className = "address-details";

    const title = document.createElement("div");
    title.className = "address-title";
    title.textContent = address.name;

    const summary = document.createElement("div");
    summary.className = "address-summary";
    summary.textContent = [
        address.addressLine1,
        address.city,
        address.state,
        address.zip
    ].filter(Boolean).join(", ");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "use-contact-button";
    button.textContent = "Fill";
    button.addEventListener("click", () =>
        useBillingAddress(address, button)
    );

    details.append(title, summary);
    card.append(details, button);
    return card;
}

function createContactField(label, value) {
    const wrapper = document.createElement("div");
    wrapper.className = "contact-field";

    const labelElement = document.createElement("span");
    labelElement.className = "contact-field-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("span");
    valueElement.className = "contact-field-value";
    valueElement.textContent = value;

    wrapper.append(labelElement, valueElement);
    return wrapper;
}

async function useContact(contact, button) {
    try {
        setButtonBusy(button, true);

        const results = await browser.scripting.executeScript({
            target: {
                tabId: activeWiseSyncTabId,
                allFrames: true
            },
            func: fillWiseSyncContactFields,
            args: [{
                firstName: contact.firstName ?? "",
                lastName: contact.lastName ?? "",
                phone: contact.phoneNumber ?? "",
                email: contact.emailAddress ?? ""
            }]
        });

        const success = results.find(result => result.result?.success);

        if (!success) {
            throw new Error(
                results.find(result => result.result?.error)
                    ?.result?.error ||
                "The Wise-Sync fields could not be updated."
            );
        }

        lastFilledContact = {
            firstName: contact.firstName ?? "",
            lastName: contact.lastName ?? "",
            emailAddress: contact.emailAddress ?? "",
            phoneNumber: contact.phoneNumber ?? ""
        };

        await browser.storage.session.set({
            lastFilledConnectWiseContact: lastFilledContact
        });

        markSelected(button);
        showStatus("Contact information filled successfully.", false, true);
    } catch (error) {
        showStatus(error?.message || "Unable to fill contact information.", true);
    } finally {
        setButtonBusy(button, false);
    }
}

async function useBillingAddress(address, button) {
    try {
        setButtonBusy(button, true);

        const fullName = [
            lastFilledContact?.firstName,
            lastFilledContact?.lastName
        ].filter(Boolean).join(" ").trim();

        const results = await browser.scripting.executeScript({
            target: {
                tabId: activeWiseSyncTabId,
                allFrames: true
            },
            func: fillWiseSyncBillingFields,
            args: [{
                fullName,
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2,
                country: "United States",
                city: address.city,
                state: address.state,
                zip: address.zip
            }]
        });

        const success = results.find(result => result.result?.success);

        if (!success) {
            throw new Error(
                results.find(result => result.result?.error)
                    ?.result?.error ||
                "The Wise-Sync billing fields could not be updated."
            );
        }

        markSelected(button);
        showStatus("Billing address filled successfully.", false, true);
    } catch (error) {
        showStatus(error?.message || "Unable to fill the billing address.", true);
    } finally {
        setButtonBusy(button, false);
    }
}

function fillWiseSyncContactFields(data) {
    return fillFields({
        firstName: [
            '[data-auto-id="npe-payer-info-first-name"]',
            data.firstName
        ],
        lastName: [
            '[data-auto-id="npe-payer-info-last-name"]',
            data.lastName
        ],
        phone: [
            '[data-auto-id="npe-payer-info-phone-number"]',
            data.phone
        ],
        email: [
            '[data-auto-id="npe-payer-info-email"]',
            data.email
        ]
    });

    function fillFields(fields) {
        const missing = [];

        for (const [name, [selector, value]] of Object.entries(fields)) {
            const field = document.querySelector(selector);

            if (!field) {
                missing.push(name);
                continue;
            }

            setValue(field, value);
        }

        return missing.length
            ? {
                success: false,
                error: `Missing fields: ${missing.join(", ")}`
            }
            : { success: true };
    }

    function setValue(field, value) {
        const prototype =
            field instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;

        const descriptor =
            Object.getOwnPropertyDescriptor(prototype, "value");

        field.focus();

        if (descriptor?.set) {
            descriptor.set.call(field, String(value ?? ""));
        } else {
            field.value = String(value ?? "");
        }

        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        field.blur();
    }
}

function fillWiseSyncBillingFields(data) {
    const fields = {
        fullName: [
            '[data-auto-id="npe-payment-details-global-payments-card-name"]',
            data.fullName
        ],
        addressLine1: [
            '[data-auto-id="npe-payment-details-billing-street-address"]',
            data.addressLine1
        ],
        addressLine2: [
            '[data-auto-id="npe-payment-details-billing-street-address-line-two"]',
            data.addressLine2
        ],
        country: [
            '[data-auto-id="npe-payment-details-billing-country"]',
            "United States"
        ],
        city: [
            '[data-auto-id="npe-payment-details-billing-suburb"]',
            data.city
        ],
        state: [
            '[data-auto-id="npe-payment-details-billing-state"]',
            data.state
        ],
        zip: [
            '[data-auto-id="npe-payment-details-billing-postcode"]',
            data.zip
        ]
    };

    const missing = [];

    for (const [name, [selector, value]] of Object.entries(fields)) {
        const field = document.querySelector(selector);

        if (!field) {
            if (name !== "addressLine2") {
                missing.push(name);
            }
            continue;
        }

        setValue(field, value);
    }

    return missing.length
        ? {
            success: false,
            error: `Missing billing fields: ${missing.join(", ")}`
        }
        : { success: true };

    function setValue(field, value) {
        field.focus();

        if (field instanceof HTMLSelectElement) {
            const target = String(value ?? "").trim().toLowerCase();

            const option = Array.from(field.options).find(item =>
                String(item.value).trim().toLowerCase() === target ||
                String(item.textContent).trim().toLowerCase() === target
            );

            field.value = option ? option.value : String(value ?? "");
        } else {
            const prototype =
                field instanceof HTMLTextAreaElement
                    ? HTMLTextAreaElement.prototype
                    : HTMLInputElement.prototype;

            const descriptor =
                Object.getOwnPropertyDescriptor(prototype, "value");

            if (descriptor?.set) {
                descriptor.set.call(field, String(value ?? ""));
            } else {
                field.value = String(value ?? "");
            }
        }

        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        field.blur();
    }
}

function filterDisplayedItems() {
    const query = normalizeComparison(contactSearchInput.value);

    if (!query) {
        currentPageMode === "billing"
            ? renderAddresses(loadedItems)
            : renderContacts(loadedItems);
        return;
    }

    if (currentPageMode === "billing") {
        renderAddresses(
            loadedItems.filter(address =>
                normalizeComparison([
                    address.name,
                    address.addressLine1,
                    address.addressLine2,
                    address.city,
                    address.state,
                    address.zip
                ].filter(Boolean).join(" ")).includes(query)
            )
        );
    } else {
        renderContacts(
            loadedItems.filter(contact =>
                normalizeComparison([
                    contact.firstName,
                    contact.lastName
                ].filter(Boolean).join(" ")).includes(query)
            )
        );
    }
}

function renderEmpty(message) {
    const element = document.createElement("p");
    element.className = "empty-message";
    element.textContent = message;
    contactsList.appendChild(element);
}

function markSelected(button) {
    document
        .querySelectorAll(".contact-card")
        .forEach(card => card.classList.remove("selected-contact"));

    button.closest(".contact-card")?.classList.add("selected-contact");
    button.textContent = "Filled";
}

function setButtonBusy(button, busy) {
    button.disabled = busy;

    if (busy) {
        button.dataset.originalText = button.textContent;
        button.textContent = "…";
    } else if (button.textContent === "…") {
        button.textContent = button.dataset.originalText || "Fill";
    }
}

function setBusy(busy) {
    unlockButton.disabled = busy;
    unlockPasswordInput.disabled = busy;
    unlockButton.textContent = busy ? "Unlocking…" : "Unlock";
}

function showStatus(message, isError = false, isSuccess = false) {
    statusElement.textContent = message;
    statusElement.className = isError
        ? "error"
        : isSuccess
            ? "success"
            : "";
}

function normalizeComparison(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function escapeConnectWiseCondition(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
}
