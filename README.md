# Warranty Upsell Tracker

Chrome extension (MV3). Team members sign in, log who contacted which Shopify order about an extended warranty, and everyone sees it. On the Shopify orders list (and order page) each order number gets a badge: **Not contacted** (red) or **Texted: Parker** etc. Click a badge to log or change status without leaving Shopify.

Data lives in Firebase (Auth email/password + Firestore) and is accessed through the REST APIs, so no SDK bundling is needed. The list refreshes every 30s.

## Firebase setup (once)
1. Create a Firebase project; add a **Web app** and copy `apiKey` and `projectId` into [config.js](config.js).
2. Build > Authentication > Sign-in method: enable **Email/Password**.
3. Build > Firestore Database: create a database, then paste [firestore.rules](firestore.rules) into Rules and publish.
4. After your team has created accounts, disable new sign-ups (Authentication > Settings > User actions) or restrict the rule to your email domain, since the web API key is not secret.

## Install
`chrome://extensions` > Developer mode > Load unpacked > select this folder. Each teammate creates an account in the popup (the name entered is what appears on orders).

## Notes
- One record per order number (`MPC2636599`, case/`#` insensitive); logging again overwrites, with a confirmation in the popup.
- Badges are injected by matching order links on `admin.shopify.com`; if Shopify changes its markup, adjust `orderTargets()` in [content.js](content.js).
