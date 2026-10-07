# INnnovators

This repository contains a Next.js website at the root and an Expo Go mobile app in `mobile/`. The mobile app displays the same website in a native WebView, so edits to `app/` appear in the browser and on your phone. It requires a running website; it does not provide offline native screens.

## Run the website and mobile app

Install dependencies once (Node.js 22 LTS recommended):

```bash
npm install
npm --prefix mobile install
```

Start the website in one terminal:

```bash
npm run dev:web
```

Open http://localhost:3000 on your computer. If the website is already running on port 3000, keep that terminal running instead of starting it again.

Start Expo in a second terminal:

```bash
npm run dev:mobile
```

Connect your phone and computer to the same Wi-Fi. Open the QR code with the iPhone Camera app or the QR scanner in Expo Go on Android. Allow Expo Go local network access if prompted. Keep both terminals running; Ctrl+C stops a server.

The app uses **Expo SDK 54** for compatibility with the App Store build of Expo Go. On Android, install the matching SDK 54 build from [expo.dev/go](https://expo.dev/go?sdkVersion=54&platform=android&device=true) if your installed version reports a mismatch. See [Expo's compatibility guide](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

## How the connection works

In development, the mobile app gets your computer's network address from Expo and opens port 3000 on that computer. No account or deployment is needed for local use. Website edits reload through Next.js; changes to `mobile/App.tsx` reload through Expo.

For a different website address or port, copy `mobile/.env.example` to `mobile/.env` and set:

```dotenv
EXPO_PUBLIC_WEBSITE_URL=http://YOUR_COMPUTER_LAN_IP:3000
```

Restart Expo after changing this setting. Use a reachable HTTPS URL for a hosted website. This value is public and must not contain secrets. On a physical phone, `localhost` points to the phone, not your computer.

If the app cannot connect:

- Open the same website URL in your phone's browser first to check network access.
- Ensure the website is running, both devices use the same Wi-Fi, and local network access is allowed. Guest Wi-Fi or a VPN may block device-to-device connections.
- If the website uses a different port, set the full address in `mobile/.env`.
- Tap **Try again** after restoring the connection.
- Expo's tunnel only exposes the Expo bundler. It does not expose the Next.js website; use a separately reachable website URL if using a tunnel.

## Project files

- `app/page.tsx`: website home page.
- `app/layout.tsx` and `app/globals.css`: website layout and styles.
- `mobile/App.tsx`: Expo Go WebView, loading state, and connection retry screen.
- `mobile/app.json`: mobile name, icons, and Expo settings.

The website and mobile app have separate dependencies and lockfiles because they require different React versions. Install dependencies in both directories. Website TypeScript checks exclude the mobile app.

## Checks

```bash
npm run lint
npm run typecheck:mobile
npx tsc --noEmit
```

Build the website with `npm run build`. This local setup does not publish the website or submit a standalone app to an app store.
