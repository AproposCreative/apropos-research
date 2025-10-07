# 🔥 Quick Fix - Firebase Permissions

## Problemet
Fejl: "Missing or insufficient permissions"

## Løsningen (2 minutter)

### 1. Åbn Firebase Console
- Gå til: https://console.firebase.google.com/
- Vælg dit projekt: **apropos-magazine-6004a**

### 2. Gå til Firestore Rules
- Klik på **Firestore Database** (venstre menu)
- Klik på **Rules** tab

### 3. Erstat reglerne
Du skal erstatte alt der står i Rules feltet med dette:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 4. Gem
- Klik **Publish**
- Vent 30 sekunder

### 5. Test
- Genstart din server: `Ctrl+C` og så `npm run dev`
- Gå til `/ai` siden
- Log ind med Google

**Det var det!** 🎉

---

## Hvis du ikke kan finde Firestore Database:
1. Klik på **Firestore Database** i venstre menu
2. Hvis det ikke er der, så klik **Create database** først
3. Vælg **Start in production mode**
4. Vælg location: **europe-west1**
5. Klik **Enable**

Så kan du gå til Rules tab og følge trin 3-5 ovenfor.
