"use strict";

(() => {
    if (window.top !== window || !isSupportedWiseSyncUrl(window.location.href)) {
        return;
    }

    if (window.__wsgchInlinePickerInstalled) {
        return;
    }

    window.__wsgchInlinePickerInstalled = true;

    const contactFieldSelectors = [
        '[data-auto-id="npe-payer-info-first-name"]',
        '[data-auto-id="npe-payer-info-last-name"]',
        '[data-auto-id="npe-payer-info-phone-number"]',
        '[data-auto-id="npe-payer-info-email"]'
    ];
    const billingFieldSelectors = [
        '[data-auto-id="npe-payment-details-global-payments-card-name"]',
        '[data-auto-id="npe-payment-details-billing-street-address"]',
        '[data-auto-id="npe-payment-details-billing-street-address-line-two"]',
        '[data-auto-id="npe-payment-details-billing-suburb"]',
        '[data-auto-id="npe-payment-details-billing-postcode"]'
    ];
    let picker = null;
    let loading = false;

    document.addEventListener("click", handlePageClick, true);
    window.addEventListener("resize", closePicker);
    window.addEventListener("scroll", event => {
        const targetIsInsidePicker = event.target instanceof Node &&
            picker?.contains(event.target);

        if (!targetIsInsidePicker) {
            closePicker();
        }
    }, true);

    async function handlePageClick(event) {
        const target = event.target;

        if (!(target instanceof Element) || picker?.contains(target)) {
            return;
        }

        const contactInput = contactFieldSelectors
            .map(selector => target.closest(selector))
            .find(Boolean);
        const billingInput = billingFieldSelectors
            .map(selector => target.closest(selector))
            .find(Boolean);

        if ((!contactInput && !billingInput) || loading) {
            return;
        }

        if (billingInput) {
            await openAddressPicker(billingInput);
            return;
        }

        loading = true;
        showLoadingPicker(contactInput);

        try {
            const companyName = readCompanyName();
            const response = await browser.runtime.sendMessage({
                type: "getInlineContacts",
                companyName
            });

            if (response?.error) {
                showErrorPicker(contactInput, response.error);
                return;
            }

            showContactPicker(
                contactInput,
                response?.contacts || [],
                companyName
            );
        } catch (error) {
            showErrorPicker(
                contactInput,
                error?.message || "Unable to load ConnectWise contacts."
            );
        } finally {
            loading = false;
        }
    }

    async function openAddressPicker(input) {
        loading = true;
        showLoadingPicker(input, "ConnectWise Billing Addresses");

        try {
            const response = await browser.runtime.sendMessage({
                type: "getInlineAddresses"
            });

            if (response?.error) {
                showErrorPicker(
                    input,
                    response.error,
                    "ConnectWise Billing Addresses"
                );
                return;
            }

            showAddressPicker(
                input,
                response?.addresses || [],
                response?.fullName || ""
            );
        } catch (error) {
            showErrorPicker(
                input,
                error?.message || "Unable to load billing addresses.",
                "ConnectWise Billing Addresses"
            );
        } finally {
            loading = false;
        }
    }

    function showLoadingPicker(input, title = "ConnectWise Contacts") {
        picker = createPickerShell(title);
        const message = document.createElement("p");
        message.className = "wsgch-message";
        message.textContent = "Loading contacts…";
        picker.appendChild(message);
        positionPicker(input);
    }

    function showErrorPicker(
        input,
        error,
        title = "ConnectWise Contacts"
    ) {
        closePicker();
        picker = createPickerShell(title);
        const message = document.createElement("p");
        message.className = "wsgch-message wsgch-error";
        message.textContent = error;
        picker.appendChild(message);
        positionPicker(input);
    }

    function showContactPicker(input, contacts, companyName) {
        closePicker();
        picker = createPickerShell("ConnectWise Contacts");

        const search = document.createElement("input");
        search.className = "wsgch-search";
        search.type = "search";
        search.placeholder = "Search contacts";
        search.autocomplete = "off";

        const list = document.createElement("div");
        list.className = "wsgch-list";

        function render(query = "") {
            list.replaceChildren();
            const normalizedQuery = normalize(query);
            const matches = contacts.filter(contact =>
                normalize(`${contact.firstName} ${contact.lastName}`)
                    .includes(normalizedQuery)
            );

            if (matches.length === 0) {
                const empty = document.createElement("p");
                empty.className = "wsgch-message";
                empty.textContent =
                    "No ConnectWise contacts are available for this company.";
                list.appendChild(empty);
                return;
            }

            for (const contact of matches) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "wsgch-contact";

                const details = document.createElement("span");
                details.className = "wsgch-contact-details";

                const name = document.createElement("span");
                name.className = "wsgch-contact-name";
                name.textContent =
                    `${contact.firstName || ""} ${contact.lastName || ""}`.trim() ||
                    "Unnamed Contact";

                const phone = document.createElement("span");
                phone.className = "wsgch-contact-phone";
                phone.textContent = formatPhoneNumber(contact.phoneNumber) ||
                    "No Phone Number";

                const select = document.createElement("span");
                select.className = "wsgch-select-label";
                select.textContent = "Select";

                details.append(name, phone);
                button.append(details, select);
                button.addEventListener("click", async event => {
                    event.preventDefault();
                    event.stopPropagation();
                    fillContactFields(contact);
                    closePicker();
                    await browser.runtime.sendMessage({
                        type: "markInlineContactSelected",
                        companyName,
                        contact
                    });
                });
                list.appendChild(button);
            }
        }

        search.addEventListener("input", () => render(search.value));
        picker.append(search, list);
        render();
        positionPicker(input);
    }

    function showAddressPicker(input, addresses, fullName) {
        closePicker();
        picker = createPickerShell("ConnectWise Billing Addresses");

        const search = document.createElement("input");
        search.className = "wsgch-search";
        search.type = "search";
        search.placeholder = "Search addresses";
        search.autocomplete = "off";

        const list = document.createElement("div");
        list.className = "wsgch-list";

        function render(query = "") {
            list.replaceChildren();
            const normalizedQuery = normalize(query);
            const matches = addresses.filter(address =>
                normalize([
                    address.name,
                    address.addressLine1,
                    address.addressLine2,
                    address.city,
                    address.state,
                    address.zip
                ].filter(Boolean).join(" ")).includes(normalizedQuery)
            );

            if (matches.length === 0) {
                const empty = document.createElement("p");
                empty.className = "wsgch-message";
                empty.textContent =
                    "No ConnectWise addresses are available for this company.";
                list.appendChild(empty);
                return;
            }

            for (const address of matches) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "wsgch-contact";

                const details = document.createElement("span");
                details.className = "wsgch-contact-details";

                const name = document.createElement("span");
                name.className = "wsgch-contact-name";
                name.textContent = address.name || "Address";

                const summary = document.createElement("span");
                summary.className = "wsgch-contact-phone";
                summary.textContent = [
                    address.addressLine1,
                    address.city,
                    address.state,
                    address.zip
                ].filter(Boolean).join(", ");

                const select = document.createElement("span");
                select.className = "wsgch-select-label";
                select.textContent = "Select";

                details.append(name, summary);
                button.append(details, select);
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    fillBillingFields(address, fullName);
                    closePicker();
                });
                list.appendChild(button);
            }
        }

        search.addEventListener("input", () => render(search.value));
        picker.append(search, list);
        render();
        positionPicker(input);
    }

    function createPickerShell(titleText) {
        closePicker();
        const element = document.createElement("aside");
        element.className = "wsgch-picker";
        element.setAttribute("aria-label", titleText);

        const heading = document.createElement("div");
        heading.className = "wsgch-heading";
        heading.textContent = titleText;

        const close = document.createElement("button");
        close.type = "button";
        close.className = "wsgch-close";
        close.setAttribute("aria-label", "Close Contact Picker");
        close.textContent = "×";
        close.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            closePicker();
        });

        element.append(heading, close);
        document.body.appendChild(element);
        return element;
    }

    function positionPicker(input) {
        const rect = input.getBoundingClientRect();
        const pickerWidth = 300;
        const gap = 14;
        let left = rect.right + gap;

        if (left + pickerWidth > window.innerWidth - 12) {
            left = Math.max(12, rect.left - pickerWidth - gap);
        }

        picker.style.left = `${left}px`;
        picker.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - 360))}px`;
    }

    function closePicker() {
        picker?.remove();
        picker = null;
    }

    function fillContactFields(contact) {
        const values = {
            '[data-auto-id="npe-payer-info-first-name"]':
                contact.firstName ?? "",
            '[data-auto-id="npe-payer-info-last-name"]':
                contact.lastName ?? "",
            '[data-auto-id="npe-payer-info-phone-number"]':
                formatPhoneNumber(contact.phoneNumber ?? ""),
            '[data-auto-id="npe-payer-info-email"]':
                contact.emailAddress ?? ""
        };

        for (const [selector, value] of Object.entries(values)) {
            const field = document.querySelector(selector);

            if (field) {
                setNativeValue(field, value);
            }
        }
    }

    function fillBillingFields(address, fullName) {
        const values = {
            '[data-auto-id="npe-payment-details-global-payments-card-name"]':
                fullName,
            '[data-auto-id="npe-payment-details-billing-street-address"]':
                address.addressLine1 ?? "",
            '[data-auto-id="npe-payment-details-billing-street-address-line-two"]':
                address.addressLine2 ?? "",
            '[data-auto-id="npe-payment-details-billing-country"]':
                address.country ?? "",
            '[data-auto-id="npe-payment-details-billing-suburb"]':
                address.city ?? "",
            '[data-auto-id="npe-payment-details-billing-state"]':
                address.state ?? "",
            '[data-auto-id="npe-payment-details-billing-postcode"]':
                address.zip ?? ""
        };

        for (const [selector, value] of Object.entries(values)) {
            const field = document.querySelector(selector);

            if (field) {
                setNativeValue(field, value);
            }
        }
    }

    function setNativeValue(field, value) {
        if (field instanceof HTMLSelectElement) {
            const target = normalize(value);
            const option = Array.from(field.options).find(item =>
                normalize(item.value) === target ||
                normalize(item.textContent) === target
            );
            field.value = option ? option.value : String(value ?? "");
            field.dispatchEvent(new Event("input", { bubbles: true }));
            field.dispatchEvent(new Event("change", { bubbles: true }));
            return;
        }

        const prototype = field instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

        if (descriptor?.set) {
            descriptor.set.call(field, String(value ?? ""));
        } else {
            field.value = String(value ?? "");
        }

        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function readCompanyName() {
        const direct = [
            'input[label="Company"]',
            'input[aria-label="Company"]',
            'input[name="Company"]',
            'input[name="company"]',
            'textarea[label="Company"]',
            'textarea[aria-label="Company"]'
        ];

        for (const selector of direct) {
            const field = document.querySelector(selector);
            const value = getValue(field);

            if (value) {
                return value;
            }
        }

        const labeledContainers = document.querySelectorAll(
            '[label="Company"], [aria-label="Company"]'
        );

        for (const container of labeledContainers) {
            const field = container.matches("input, textarea, select")
                ? container
                : container.querySelector(
                    'input:not([type="hidden"]), textarea, select'
                );
            const value = getValue(field || container);

            if (value) {
                return value;
            }
        }

        for (const label of document.querySelectorAll("label")) {
            const labelText = normalize(
                String(label.textContent ?? "").replace(/[:*]+$/g, "")
            );

            if (labelText !== "company") {
                continue;
            }

            const field = label.htmlFor
                ? document.getElementById(label.htmlFor)
                : label.parentElement?.querySelector("input, textarea, select");
            const value = getValue(field);

            if (value) {
                return value;
            }
        }

        return "";
    }

    function getValue(field) {
        if (!field) {
            return "";
        }

        if ("value" in field) {
            return String(field.value ?? "").trim();
        }

        const nestedField = field.querySelector?.(
            'input:not([type="hidden"]), textarea, select'
        );

        if (nestedField) {
            return getValue(nestedField);
        }

        const attributeValue = String(
            field.getAttribute?.("value") ?? ""
        ).trim();

        if (attributeValue) {
            return attributeValue;
        }

        const text = String(field.textContent ?? "").trim();
        return normalize(text) === "company" ? "" : text;
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
})();
