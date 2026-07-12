Wise-Sync Guest Checkout Helper
==================================

Developer: The Floofy Fox LLC
Designed and developed by: Jeffery Hancock
Version: 1.3.2
Website: https://www.thefloofyfox.com/
Copyright: Copyright (c) 2026 The Floofy Fox LLC. All rights reserved.

Chrome compatibility
--------------------
This package targets Google Chrome 122 and later using Manifest V3 and an
extension service worker. For local testing, open chrome://extensions, enable
Developer mode, choose Load unpacked, and select this directory.

Download the published Chrome extension source package from:
https://www.thefloofyfox.com/downloads/browser-extensions/chrome/connectwise-to-wisepay-1.3.2.zip

Purpose
-------
Securely fills Wise-Sync guest checkout contact and billing fields using
matching ConnectWise company contacts and addresses. Contacts and addresses
can be selected from the toolbar popup or directly beside supported checkout
fields using the inline pickers.

Security
--------
The ConnectWise credentials are encrypted in Chrome extension storage using
AES-GCM and a password-derived key. A short password is easier to brute-force,
so a longer password is still recommended.

Chrome asks for access to the configured ConnectWise API host when credentials
are saved. This permission is required for toolbar and inline-picker API calls.


Version 1.0.0
-------------
- Initial release.


Version 1.0.1
-------------
- Corrected ConnectWise email and phone retrieval.
- Reads email and phone from each contact's communicationItems collection.
- Falls back to defaultPhoneNbr and defaultPhoneExtension when needed.


Version 1.0.2
-------------
- Added a WorkOS-inspired dark popup theme.
- Simplified contact cards to First Name, Last Name, and a Fill button.
- Preserved searchable and scrollable contact results.


Version 1.0.3
-------------
- Unlocks once per browser session.
- Decrypted credentials are held only in browser.storage.session memory.
- The session unlock is cleared automatically when Chrome closes.
- Added a manual Lock button to clear the unlocked session immediately.


Version 1.0.4
-------------
- Caches the last successfully detected Wise-Sync company name in session memory.
- Reuses the cached company when the popup is reopened or the current page does not expose a company name.
- Replaces the cached value only after a different company name is successfully detected.
- The cached company is cleared automatically when Chrome closes.


Version 1.1.0
-------------
- Added a second-stage billing address workflow.
- Remembers the last contact filled during the browser session.
- Uses the cached company name after Wise-Sync moves to the billing page.
- Retrieves the company main address and active ConnectWise company sites.
- Prioritizes default billing and primary sites.
- Allows searching and selecting an address with a Fill button.
- Populates cardholder name, street lines, United States, city, full state name, and ZIP.


Version 1.1.1
-------------
- Restyled the preferences page with a WorkOS Auth-inspired dark theme.
- Unified typography, controls, spacing, borders, status colors, and security notices.
- Added responsive styling for smaller browser windows.


Version 1.1.2
-------------
- Supports Wise-Sync using the same /npe/ transaction URL for both contact and billing steps.
- Detects the current step by page fields instead of URL changes.
- Waits up to 8 seconds for dynamically rendered contact or billing fields.


Version 1.1.3
-------------
- Fixed billing Fill actions losing the active Wise-Sync tab reference.
- clearResults no longer clears the active tab ID.
- Billing address loading and filling now re-detect the active Wise-Sync tab when needed.


Version 1.1.4
-------------
- Fixed a popup JavaScript syntax error caused by an unclosed function.
- Restored the Load Contacts/Addresses button.
- Restored the Extension Settings button.
- Preserved dynamic contact-versus-billing page detection.


Version 1.2.0
-------------
- Detects contact mode only when a Company field is present.
- Detects billing mode only when the billing street-address field is present.
- Shows a locked unsupported-page state when neither field is detected.
- Automatically loads contacts or addresses when the popup opens and the extension is already unlocked.
- After unlocking, automatically loads the appropriate data without a separate Load button.


Version 1.2.1
-------------
- Reduced ConnectWise API calls by caching the matched company, contacts, and addresses in browser session memory.
- Uses one combined company lookup for exact name or identifier matching.
- Reuses cached contacts when reopening the popup on the same company.
- Reuses cached addresses on the billing step and on repeated popup opens.
- Clears company-related caches only when a different company is detected.
- Enforces GET-only ConnectWise requests. The extension does not send POST, PUT, PATCH, or DELETE requests.


Version 1.2.2
-------------
- Detects an already-rendered Wise-Sync contact or billing form immediately.
- Replaced repeated polling with a MutationObserver for late-rendered fields.
- Reduced the maximum fallback detection delay from 8 seconds to 1.5 seconds.
- Cached addresses still load without additional ConnectWise requests.


Version 1.2.3
-------------
- Checks for the Wise-Sync contact or billing form immediately when opened.
- If neither form is found, waits 750 milliseconds and checks one more time.
- Removed MutationObserver-based waiting and extended detection loops.
- Shows the unsupported-page state after the second unsuccessful check.


Version 1.2.4
-------------
- Allows the extension to be unlocked from unsupported pages.
- Allows the extension to be manually locked from unsupported pages.
- Unsupported pages still disable contact and billing data operations.


Version 1.2.5
-------------
- Added Firefox data_collection_permissions required for new AMO submissions.
- Declares authentication information, personally identifying information, and website content.
- Updated Firefox minimum version to 140.0 for built-in data consent support.


Version 1.3.0
-------------
- Added inline, searchable ConnectWise contact and billing-address pickers to supported Wise-Sync fields.
- Added background GET-only API handling so page scripts receive only the contact and address values needed for filling forms.
- Added session caching for matched companies, contacts, and addresses to avoid unnecessary API requests when the company is unchanged.
- Added consistent United States phone formatting as (xxx) xxx-xxxx for display and insertion.
- Preserves blank contact and address values as blank when filling Wise-Sync fields.
- Added clear empty-result and ConnectWise API connection-error messages.
- Restricted Wise-Sync content access to secure2.wise-sync.com transaction URLs with a non-empty transactionId.
- Added event-driven contact and billing form detection without continuous page polling.
- Added mandatory first-run password setup and independent password changes that re-encrypt saved API credentials.
- Added a password confirmation window when encrypting and saving credential changes.
- Added a read-only Test Connection action and a full Reset Add-on danger-zone action.
- Added responsive, two-column settings layouts and an expandable API credential setup guide.
- Added Auto, Dark, and Light themes shared by the popup and settings page; Auto follows the browser color preference.
- Redesigned locked, unlocked, unconfigured, unsupported-page, and missing-payment-method popup states.
- Added developer and version metadata to the popup footer.


Version 1.3.1
-------------
- Added a Google Chrome Manifest V3 build with a Chrome extension service worker.
- Added a Chrome compatibility layer for the shared Promise-based extension APIs.
- Added and refined inline contact and billing-address pickers beside supported Wise-Sync fields.
- Fixed picker injection across redirected /npe and /npe/ transaction URLs.
- Fixed company-name detection for Wise-Sync fields wrapped in labeled containers.
- Limits company lookups to the first exact ConnectWise match and reuses cached company data when unchanged.
- Added consistent (xxx) xxx-xxxx phone formatting for contact display and insertion.
- Preserves missing contact and address values as blank when filling Wise-Sync fields.
- Added explicit empty-contact, empty-address, and ConnectWise API connection messages.
- Prevented inline picker search fields from taking focus away from manual Wise-Sync input.
- Added a completely new borderless, full-size extension icon and regenerated all required icon sizes.
- Added developer website, author credit, updated add-on description, and 2026 copyright metadata.


Version 1.3.2
-------------
- Added an optional setting that opens popups originating from the configured ConnectWise site and eligible embedded frames as normal tabs.
- Added a configurable popup source URL, defaulting to https://na.myconnectwise.net/.
- Added a move-after-opening fallback for JavaScript popup flows that cannot be converted before window creation.
