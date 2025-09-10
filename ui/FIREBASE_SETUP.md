# Firebase Authentication Setup

## 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: "apropos-research"
4. Enable Google Analytics (optional)
5. Click "Create project"

## 2. Enable Authentication

1. In your Firebase project, go to "Authentication"
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" provider
5. Click "Save"

## 3. Get Configuration

1. Go to Project Settings (gear icon)
2. Scroll down to "Your apps"
3. Click "Web" icon to add web app
4. Register app with name "apropos-research-web"
5. Copy the configuration object

## 4. Environment Variables

Create a `.env.local` file in the `ui` directory with:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## 5. Deploy to Vercel

Add the same environment variables to your Vercel project:

1. Go to Vercel Dashboard
2. Select your project
3. Go to Settings > Environment Variables
4. Add each variable with the same names

## 6. Test Authentication

1. Visit `/login` to test the login page
2. Create a new account
3. Test login/logout functionality
4. Verify protected routes redirect to login

## Features Included

- ✅ Email/Password Authentication
- ✅ User Registration
- ✅ Password Reset
- ✅ Protected Routes
- ✅ Login Page (matching instant-access-gate design)
- ✅ Logout functionality
- ✅ User session management
