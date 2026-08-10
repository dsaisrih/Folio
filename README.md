# Folio

Folio is a private task and idea manager with Firebase-backed syncing and a decoy mode for added privacy.

## What you need
- A modern browser
- A Firebase account
- Python 3 (recommended for local run) or any static server

## 1. Create a Firebase project
1. Go to https://console.firebase.google.com
2. Click Create project
3. In Firebase Console, go to Authentication → Sign-in method
4. Enable Email/Password
5. Go to Firestore Database and create a database
6. Go to Project settings → General → Your apps → Web app and copy the config values

## 2. Add your Firebase config
Open firebase-config.js and replace the placeholder values with your real Firebase config:

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## 3. Set Firestore rules
In Firebase Console, go to Firestore Database → Rules and paste the contents of firestore.rules, then click Publish.

## 4. Run it locally
Because this app uses ES modules, it should be served from a local web server instead of opened directly as a file.

### Windows
Open PowerShell or Command Prompt in the project folder and run:

```bash
cd C:\Users\dsais\Desktop\Folio
py -m http.server 8080
```

Then open this in your browser:

```text
http://localhost:8080
```

### Alternative
If you already have Node.js installed, you can also run:

```bash
npx serve .
```

Then open the local URL shown in the terminal.

## 5. Use it
- Create an account or log in
- Add tasks and ideas
- Your data syncs to Firebase when you use the real account mode
- The decoy mode stays local-only on the device

## How the safety system works
- Enter the correct password and you access the real synced dashboard.
- Enter the wrong password twice and the app quietly opens a local-only decoy dashboard instead.
- The decoy data stays on that device only and never reaches Firebase.

## Phone / installable app
The app also supports installable mobile behavior. Once served locally, you can usually install it from your browser’s menu for a more app-like experience.
