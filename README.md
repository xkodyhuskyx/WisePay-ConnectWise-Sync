# Wise-Sync Guest Checkout Helper

Browser-specific extension packages are maintained separately:

- `firefox/source/` — Unpacked Firefox Manifest V3 extension source.
- `firefox/build/` — Packaged Firefox artifacts and the self-hosted update manifest.
- `chrome/source/` — Unpacked Google Chrome Manifest V3 extension source.
- `chrome/build/` — Packaged Chrome artifacts.

Both builds provide the same encrypted ConnectWise credential storage, toolbar popup, settings page, and Wise-Sync inline contact and billing-address pickers.

## Installation

### Firefox

Install the published Firefox extension from:

[Install Wise-Sync Guest Checkout Helper for Firefox](https://www.thefloofyfox.com/downloads/browser-extensions/firefox/connectwise-to-wisepay/connectwise-to-wisepay-1.3.2.xpi)

For local development, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `firefox/source/manifest.json`.

### Google Chrome

Download the published Chrome extension source package from:

[Download Wise-Sync Guest Checkout Helper for Chrome](https://www.thefloofyfox.com/downloads/browser-extensions/chrome/connectwise-to-wisepay-1.3.2.zip)

For local development, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `chrome/source/` directory.

The Chrome build requires Chrome 122 or later. The Firefox build requires desktop Firefox 140 or later and is not enabled for Firefox for Android.
