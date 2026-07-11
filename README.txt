Wise-Sync Guest Checkout Helper
==================================

Developer: The Floofy Fox LLC
Version: 1.0.0

Purpose
-------
Populates First Name, Last Name, Phone Number, Address, and Email in Wise-Sync
guest checkout using a selected contact from the matching ConnectWise company.

Temporary installation in Firefox
---------------------------------
1. Extract this ZIP file.
2. Open Firefox and navigate to about:debugging
3. Select "This Firefox".
4. Select "Load Temporary Add-on".
5. Select manifest.json from the extracted project folder.

Security
--------
The ConnectWise credentials are encrypted in Firefox extension storage using
AES-GCM and a password-derived key. A short password is easier to brute-force,
so a longer password is still recommended.


Version 1.0.0
-------------
- Initial Extension Release
