"use strict";

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !isSupportedWiseSyncUrl(tab?.url)) {
        return;
    }

    browser.scripting.insertCSS({
        target: { tabId },
        files: ["content/wise-sync-input-listener.css"]
    }).catch(() => {});

    browser.scripting.executeScript({
        target: { tabId },
        files: ["content/wise-sync-input-listener.js"]
    }).catch(() => {});
});

browser.runtime.onMessage.addListener((message, sender) => {
    if (!isAuthorizedWiseSyncSender(sender)) {
        return undefined;
    }

    if (message?.type === "getInlineContacts") {
        return getInlineContacts(
            message.companyName,
            sender.url || sender.tab?.url
        );
    }

    if (message?.type === "getInlineAddresses") {
        return getInlineAddresses();
    }

    if (message?.type === "markInlineContactSelected") {
        return markInlineContactSelected(
            sender.url || sender.tab?.url,
            message.companyName,
            message.contact
        );
    }

    return undefined;
});

function isAuthorizedWiseSyncSender(sender) {
    const senderUrl = sender?.url || sender?.tab?.url;
    return sender?.frameId === 0 && isSupportedWiseSyncUrl(senderUrl);
}

function isSupportedWiseSyncUrl(url) {
    try {
        const parsed = new URL(url);

        return parsed.protocol === "https:" &&
            parsed.hostname === "secure2.wise-sync.com" &&
            (parsed.pathname === "/npe" || parsed.pathname === "/npe/") &&
            String(parsed.searchParams.get("transactionId") ?? "").trim() !== "";
    } catch {
        return false;
    }
}

async function getInlineContacts(companyName, transactionUrl) {
    try {
        await browser.storage.session.set({
            lastWiseSyncInputState: {
                url: transactionUrl,
                mode: "contact"
            }
        });

        const stored = await browser.storage.session.get([
            "addonUnlocked",
            "unlockedConnectWiseCredentials",
            "cachedWiseSyncCompanyName",
            "cachedConnectWiseCompanyRecord",
            "cachedConnectWiseContacts"
        ]);

        if (!stored.addonUnlocked || !stored.unlockedConnectWiseCredentials) {
            return {
                error: "Unlock the add-on from the Firefox toolbar first."
            };
        }

        const normalizedCompanyName = String(companyName ?? "").trim();

        if (!normalizedCompanyName) {
            return { error: "The Wise-Sync company could not be identified." };
        }

        const credentials = stored.unlockedConnectWiseCredentials;
        const cachedCompanyMatches =
            normalize(stored.cachedWiseSyncCompanyName) ===
                normalize(normalizedCompanyName) &&
            companyMatches(
                stored.cachedConnectWiseCompanyRecord,
                normalizedCompanyName
            );
        let company = cachedCompanyMatches
            ? stored.cachedConnectWiseCompanyRecord
            : null;

        if (!company) {
            company = await findCompany(normalizedCompanyName, credentials);
            await browser.storage.session.set({
                cachedWiseSyncCompanyName: normalizedCompanyName,
                cachedConnectWiseCompanyRecord: company
            });
            await browser.storage.session.remove([
                "cachedConnectWiseContacts",
                "cachedConnectWiseAddresses"
            ]);
        }

        let contacts = cachedCompanyMatches &&
            Array.isArray(stored.cachedConnectWiseContacts)
            ? stored.cachedConnectWiseContacts
            : null;

        if (!contacts) {
            contacts = await getCompanyContacts(company.id, credentials);
            await browser.storage.session.set({
                cachedConnectWiseContacts: contacts
            });
        }

        return {
            selected: false,
            contacts: contacts.map(contact => ({
                id: contact.id,
                firstName: String(contact.firstName ?? ""),
                lastName: String(contact.lastName ?? ""),
                phoneNumber: String(contact.phoneNumber ?? ""),
                emailAddress: String(contact.emailAddress ?? "")
            }))
        };
    } catch (error) {
        return { error: error?.message || "Unable to load ConnectWise contacts." };
    }
}

async function markInlineContactSelected(transactionUrl, companyName, contact) {
    await browser.storage.session.set({
        cachedWiseSyncCompanyName: String(companyName ?? "").trim(),
        lastFilledConnectWiseContact: {
            firstName: String(contact?.firstName ?? ""),
            lastName: String(contact?.lastName ?? ""),
            phoneNumber: String(contact?.phoneNumber ?? ""),
            emailAddress: String(contact?.emailAddress ?? "")
        }
    });

    return { success: true };
}

async function getInlineAddresses() {
    try {
        const stored = await browser.storage.session.get([
            "addonUnlocked",
            "unlockedConnectWiseCredentials",
            "cachedWiseSyncCompanyName",
            "cachedConnectWiseCompanyRecord",
            "cachedConnectWiseAddresses",
            "lastFilledConnectWiseContact"
        ]);

        if (!stored.addonUnlocked || !stored.unlockedConnectWiseCredentials) {
            return { error: "Unlock the add-on from the Firefox toolbar first." };
        }

        if (!stored.cachedWiseSyncCompanyName) {
            return { error: "Select a contact before choosing a billing address." };
        }

        if (!stored.lastFilledConnectWiseContact) {
            return { error: "Select a contact before choosing a billing address." };
        }

        const credentials = stored.unlockedConnectWiseCredentials;
        let company = stored.cachedConnectWiseCompanyRecord;

        if (!companyMatches(company, stored.cachedWiseSyncCompanyName)) {
            company = await findCompany(
                stored.cachedWiseSyncCompanyName,
                credentials
            );
            await browser.storage.session.set({
                cachedConnectWiseCompanyRecord: company
            });
        }

        let addresses = Array.isArray(stored.cachedConnectWiseAddresses)
            ? stored.cachedConnectWiseAddresses
            : null;

        if (!addresses) {
            addresses = await getCompanyAddresses(company, credentials);
            await browser.storage.session.set({
                cachedConnectWiseAddresses: addresses
            });
        }

        return {
            fullName: [
                stored.lastFilledConnectWiseContact.firstName,
                stored.lastFilledConnectWiseContact.lastName
            ].filter(Boolean).join(" ").trim(),
            addresses
        };
    } catch (error) {
        return { error: error?.message || "Unable to load billing addresses." };
    }
}

function companyMatches(company, companyName) {
    const expected = normalize(companyName);
    return Boolean(company) && (
        normalize(company.name) === expected ||
        normalize(company.identifier) === expected
    );
}

async function findCompany(companyName, credentials) {
    const escaped = String(companyName)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
    const companies = await connectWiseGet(
        "/company/companies",
        {
            conditions: `(name="${escaped}" OR identifier="${escaped}")`,
            fields: "id,name,identifier,addressLine1,addressLine2,city,state,zip,country",
            pageSize: 1
        },
        credentials
    );
    const matches = (Array.isArray(companies) ? companies : [])
        .filter(company => companyMatches(company, companyName));

    if (matches.length === 0) {
        throw new Error(
            `No ConnectWise company matched "${companyName}".`
        );
    }

    return matches[0];
}

async function getCompanyContacts(companyId, credentials) {
    const contacts = await connectWiseGet(
        "/company/contacts",
        {
            conditions: `company/id=${Number(companyId)}`,
            fields: "id,firstName,lastName,inactiveFlag,defaultPhoneNbr,defaultPhoneExtension,communicationItems",
            orderBy: "lastName asc, firstName asc",
            pageSize: 100
        },
        credentials
    );

    return (Array.isArray(contacts) ? contacts : [])
        .filter(contact => contact.inactiveFlag !== true)
        .map(normalizeContact);
}

async function getCompanyAddresses(company, credentials) {
    const sites = await connectWiseGet(
        `/company/companies/${Number(company.id)}/sites`,
        {
            fields: "id,name,addressLine1,addressLine2,city,stateReference,zip,country,primaryAddressFlag,defaultBillingFlag,inactiveFlag",
            orderBy: "name asc",
            pageSize: 100
        },
        credentials
    );
    const addresses = [];
    const mainAddress = normalizeAddress({
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

    if (hasUsableAddress(mainAddress)) {
        addresses.push(mainAddress);
    }

    for (const site of Array.isArray(sites) ? sites : []) {
        if (site.inactiveFlag !== true) {
            const address = normalizeAddress(site);

            if (hasUsableAddress(address)) {
                addresses.push(address);
            }
        }
    }

    const seen = new Set();
    return addresses.filter(address => {
        const key = [
            address.addressLine1,
            address.addressLine2,
            address.city,
            address.state,
            address.zip
        ].map(normalize).join("|");

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    }).sort((a, b) => {
        const aPriority = (a.defaultBillingFlag ? 0 : 2) +
            (a.primaryAddressFlag ? 0 : 1);
        const bPriority = (b.defaultBillingFlag ? 0 : 2) +
            (b.primaryAddressFlag ? 0 : 1);
        return aPriority - bPriority || a.name.localeCompare(b.name);
    });
}

function normalizeAddress(source) {
    return {
        id: source.id,
        name: String(source.name || "Address"),
        addressLine1: String(source.addressLine1 ?? "").trim(),
        addressLine2: String(source.addressLine2 ?? "").trim(),
        city: String(source.city ?? "").trim(),
        state: fullStateName(
            source.stateReference?.name ??
            source.stateReference?.identifier ??
            source.state ?? ""
        ),
        zip: String(source.zip ?? "").trim(),
        country: String(
            source.country?.name ??
            source.country?.identifier ??
            source.country ??
            ""
        ).trim(),
        primaryAddressFlag: source.primaryAddressFlag === true,
        defaultBillingFlag: source.defaultBillingFlag === true
    };
}

function hasUsableAddress(address) {
    return Boolean(
        address.addressLine1 || address.city || address.state || address.zip
    );
}

function fullStateName(value) {
    const states = {
        AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
        CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
        FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
        IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
        KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
        MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
        MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
        NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
        NM: "New Mexico", NY: "New York", NC: "North Carolina",
        ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
        PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
        SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
        VT: "Vermont", VA: "Virginia", WA: "Washington",
        WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
        DC: "District of Columbia"
    };
    const raw = String(value ?? "").trim();
    return states[raw.toUpperCase()] ?? raw;
}

function normalizeContact(contact) {
    const items = Array.isArray(contact.communicationItems)
        ? contact.communicationItems
        : [];
    const emailItems = items.filter(item => communicationType(item) === "email");
    const phoneItems = items.filter(item => communicationType(item) === "phone");
    const email = emailItems.find(item => item.defaultFlag === true) || emailItems[0];
    const phone = phoneItems.find(item => item.defaultFlag === true) || phoneItems[0];

    return {
        ...contact,
        emailAddress: String(email?.value ?? "").trim(),
        phoneNumber: formatPhoneNumber(
            phone?.value ?? contact.defaultPhoneNbr ?? ""
        )
    };
}

function communicationType(item) {
    const explicit = String(item?.communicationType ?? "").toLowerCase();

    if (explicit) {
        return explicit;
    }

    const name = String(item?.type?.name ?? item?.type?.description ?? "")
        .toLowerCase();
    return name.includes("email")
        ? "email"
        : /phone|mobile|cell|office|home/.test(name)
            ? "phone"
            : name;
}

async function connectWiseGet(endpoint, query, credentials) {
    const baseUrl = String(credentials.baseUrl).replace(/\/+$/, "");
    const apiPath = `/${String(credentials.apiPath).replace(/^\/+|\/+$/g, "")}`;
    const endpointPath = `/${String(endpoint).replace(/^\/+/, "")}`;
    const url = new URL(`${baseUrl}${apiPath}${endpointPath}`);

    for (const [name, value] of Object.entries(query)) {
        url.searchParams.set(name, String(value));
    }

    const username = `${credentials.companyId}+${credentials.publicKey}`;
    let response;

    try {
        response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Authorization": `Basic ${btoa(`${username}:${credentials.privateKey}`)}`,
                "clientId": credentials.clientId,
                "Accept": "application/vnd.connectwise.com+json; version=2026.4"
            }
        });
    } catch {
        throw new Error(
            "Unable to connect to the ConnectWise API. Check the network and API settings."
        );
    }
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
            body?.message || body?.error || body?.code ||
            `ConnectWise returned HTTP ${response.status}.`
        );
    }

    return body;
}

function normalize(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatPhoneNumber(value) {
    const original = String(value ?? "").trim();
    const withoutExtension = original.replace(
        /\s*(?:ext\.?|extension|x)\s*\d+.*$/i,
        ""
    );
    let digits = withoutExtension.replace(/\D/g, "");

    if (digits.length === 11 && digits.startsWith("1")) {
        digits = digits.slice(1);
    }

    return digits.length === 10
        ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
        : original;
}
