# Firebase Setup Guide for Apropos AI Writer

## 🔥 Firebase Konfiguration

Din Firebase er allerede sat op med følgende credentials:
- **Project ID:** `apropos-magazine-6004a`
- **Auth Domain:** `apropos-magazine-6004a.firebaseapp.com`

---

## ✅ Trin 1: Aktiver Google Sign-In

1. Gå til [Firebase Console](https://console.firebase.google.com/)
2. Vælg dit projekt: **apropos-magazine-6004a**
3. Klik på **Authentication** i venstre menu
4. Klik på **Get Started** (hvis det ikke allerede er aktiveret)
5. Gå til **Sign-in method** tab
6. Find **Google** i listen
7. Klik på Google og **Enable** det
8. Indtast en **Project support email** (din email)
9. Klik **Save**

---

## ✅ Trin 2: Opret Firestore Database

1. I Firebase Console, klik på **Firestore Database** i venstre menu
2. Klik på **Create database**
3. Vælg **Start in production mode** (vi sætter regler bagefter)
4. Vælg en location (vælg `europe-west1` for EU/Danmark)
5. Klik **Enable**

---

## ✅ Trin 3: Opsæt Firestore Security Rules

1. I Firestore Database, gå til **Rules** tab
2. Erstat de eksisterende regler med følgende:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Brugere kan kun læse/skrive deres egne drafts
    match /drafts/{draftId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    
    // Brugere kan kun læse/skrive deres egne chat sessions
    match /chatSessions/{sessionId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    
    // Brugere kan kun læse/skrive deres egne eksporterede artikler
    match /exportedArticles/{articleId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

3. Klik **Publish**

---

## 📊 Database Struktur

Firebase vil automatisk oprette følgende collections når de bruges:

### `drafts` Collection
```typescript
{
  id: string,
  userId: string,
  title: string,
  chatTitle: string,
  messages: ChatMessage[],
  articleData: object,
  notes: string,
  createdAt: Date,
  updatedAt: Date,
  lastModified: Date
}
```

### `chatSessions` Collection
```typescript
{
  id: string,
  userId: string,
  chatTitle: string,
  messages: ChatMessage[],
  notes: string,
  articleData: object,
  createdAt: Date,
  updatedAt: Date
}
```

### `exportedArticles` Collection
```typescript
{
  id: string,
  userId: string,
  title: string,
  category: string,
  subtitle?: string,
  content: string,
  format: 'html' | 'markdown' | 'pdf' | 'docx',
  createdAt: Date,
  exportedAt: Date
}
```

---

## 🚀 Funktioner der nu er implementeret:

✅ **Auto-save** - Gemmer automatisk til Firebase efter 2 sekunders inaktivitet
✅ **Google Sign-In** - Brugere logger ind med deres Google konto
✅ **Copy to Clipboard** - Kopier AI-svar med et enkelt klik
✅ **User Profile** - Viser brugerens navn og billede i toppen
✅ **Draft Management** - Alle artikler gemmes som drafts i Firebase
✅ **Multi-device Sync** - Arbejd på tværs af enheder (alt gemmes i skyen)

---

## 🔐 Sikkerhed

- Alle data er beskyttet med Firebase Security Rules
- Kun autentificerede brugere kan tilgå systemet
- Brugere kan kun se og redigere deres egne data
- Google Sign-In giver sikker authentication

---

## 🎉 Næste skridt

Efter du har aktiveret Google Sign-In og Firestore:
1. Genstart development serveren: `npm run dev`
2. Gå til `/ai` siden
3. Log ind med Google
4. Start med at skrive din første artikel!

Firebase vil automatisk oprette collections første gang de bruges.

