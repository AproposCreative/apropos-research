# 🔥 Firestore Rules Fix - "Missing or insufficient permissions"

## Problem
Du får fejlen: `FirebaseError: Missing or insufficient permissions`

Dette sker fordi Firestore Security Rules ikke er konfigureret endnu.

---

## ✅ Løsning

### Trin 1: Gå til Firebase Console
1. Åbn [Firebase Console](https://console.firebase.google.com/)
2. Vælg dit projekt: **apropos-magazine-6004a**
3. Klik på **Firestore Database** i venstre menu

### Trin 2: Opret Database (hvis ikke allerede gjort)
1. Hvis du ikke har en database endnu, klik **Create database**
2. Vælg **Start in production mode**
3. Vælg location: `europe-west1` (Belgium)
4. Klik **Enable**

### Trin 3: Opsæt Security Rules
1. Gå til **Rules** tab i Firestore
2. Erstat ALLE eksisterende regler med dette:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to all authenticated users for now
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Trin 4: Publish Rules
1. Klik **Publish** knappen
2. Vent 30 sekunder

---

## 🔒 Mere Sikre Rules (Valgfrit)

Når du vil have mere sikkerhed senere, kan du erstatte reglerne med:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Brugere kan kun læse/skrive deres egne data
    match /drafts/{draftId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    
    match /chatSessions/{sessionId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    
    match /exportedArticles/{articleId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

---

## ✅ Test
1. Genstart din development server: `npm run dev`
2. Gå til `/ai` siden
3. Log ind med Google
4. Prøv at skrive en besked

Fejlen skulle nu være væk! 🎉

---

## 🚨 Hvis det stadig ikke virker

Kontakt mig med:
1. Screenshot af Firebase Console → Firestore → Rules
2. Den præcise fejlbesked du får
3. Hvilke trin du har fulgt

