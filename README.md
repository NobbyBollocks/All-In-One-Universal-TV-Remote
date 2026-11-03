# TV Remote (PC -> Android TV)

A desktop app to control an Android TV (including LUXOR Android TVs) from your Windows PC over the local network.

## Requirements
- Windows 10/11
- Node.js 18+ (for running from source)
- TV and PC on the same network
- TV must support Android TV Remote protocol (most Android/Google TVs do)

## Run
```
npm install
npm start
```

## First-time pairing
1. Turn on the TV.
2. Make sure "Remote control" / network remote is allowed in TV settings (Settings -> Device Preferences -> About/Developer? or Remotes & Accessories).
3. In the app, enter the TV's IP (or use "Scan network") and click Connect.
4. A 6-character hex code appears on the TV. Enter it in the app prompt.
5. The app stores pairing certificates; next time it connects automatically.

## Troubleshooting
- If scan finds nothing, verify TV and PC are on the same subnet and TV is awake.
- If pairing fails, retry; some TVs need the screen on and not in standby.
- If your TV doesn't support the Android TV Remote protocol, control via ADB (enable Developer options -> Network debugging) is an alternative.

## Vestel / Luxor TVs
Luxor and other Vestel-based TVs are detected automatically via port 56789. No pairing code is needed; the status reads 'Connected (Vestel SmartCenter)'.

## Build

pm install

pm run build

Produces a Windows installer in dist/.

