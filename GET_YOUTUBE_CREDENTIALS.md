# How to Get YouTube Client ID and Secret

## Step-by-Step Guide

### Step 1: Go to Google Cloud Console
Visit: https://console.cloud.google.com/

### Step 2: Create or Select a Project
1. Click the project dropdown at the top (next to "Google Cloud")
2. Click "New Project"
3. Enter a project name: `YouTube Crypto Bot` (or any name you like)
4. Click "Create"
5. Wait for the project to be created, then select it from the dropdown

### Step 3: Enable YouTube Data API v3
1. In the left sidebar, click "APIs & Services" → "Library"
2. In the search box, type: `YouTube Data API v3`
3. Click on "YouTube Data API v3"
4. Click the blue "Enable" button
5. Wait for it to enable (you'll see a checkmark)

### Step 4: Configure OAuth Consent Screen
1. In the left sidebar, click "APIs & Services" → "OAuth consent screen"
2. Select "External" (unless you're using Google Workspace, then use "Internal")
3. Click "Create"

**Fill in the form:**
- **App name**: `Crypto B Bot` (or any name)
- **User support email**: Your email address
- **Developer contact information**: Your email address
- Click "Save and Continue"

**Scopes (Step 2):**
- Click "Add or Remove Scopes"
- Search for and add these two scopes:
  - `https://www.googleapis.com/auth/youtube.upload`
  - `https://www.googleapis.com/auth/youtube`
- Click "Update" then "Save and Continue"

**Test users (Step 3):**
- If you're testing, add your email address as a test user
- Click "Add Users" → Enter your email → "Add"
- Click "Save and Continue"

**Summary (Step 4):**
- Review everything
- Click "Back to Dashboard"

### Step 5: Create OAuth 2.0 Credentials
1. In the left sidebar, click "APIs & Services" → "Credentials"
2. Click the blue "+ CREATE CREDENTIALS" button at the top
3. Select "OAuth client ID"

**If you see a warning about OAuth consent screen:**
- Click "Configure Consent Screen" and complete Step 4 above first

**Create OAuth client ID:**
1. **Application type**: Select "Web application"
2. **Name**: `Crypto B Bot` (or any name)
3. **Authorized redirect URIs**: Click "Add URI"
   - Enter: `http://localhost:3000/auth/youtube/callback`
   - Click "Add"
4. Click "Create"

### Step 6: Copy Your Credentials
You'll see a popup with:
- **Your Client ID**: Something like `123456789-abc.apps.googleusercontent.com`
- **Your Client Secret**: Something like `GOCSPX-abc123xyz`

**IMPORTANT:** Copy both of these NOW - you won't be able to see the secret again!

### Step 7: Add to Your .env File
Open your `.env` file and add:

```env
YOUTUBE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-client-secret-here
YOUTUBE_REDIRECT_URI=http://localhost:3000/auth/youtube/callback
```

Replace `your-client-id-here` and `your-client-secret-here` with the actual values you copied.

### Step 8: Get Refresh Token
After adding the credentials to `.env`, run:

```bash
npm run setup:youtube
```

This will:
1. Open a browser window (or give you a URL to visit)
2. Ask you to authorize the app
3. Redirect you to a URL with a `code` parameter
4. Ask you to paste that code
5. Automatically save the refresh token to your `.env` file

## Quick Reference

**Where to find your credentials later:**
- Go to: https://console.cloud.google.com/
- Select your project
- Click "APIs & Services" → "Credentials"
- Your Client ID will be listed (but not the secret - you need to create a new one if lost)

## Troubleshooting

**"OAuth client creation failed"**
- Make sure you completed the OAuth consent screen setup first

**"Redirect URI mismatch"**
- The redirect URI in Google Cloud must EXACTLY match: `http://localhost:3000/auth/youtube/callback`
- Check for typos, extra spaces, or missing `http://`

**"Invalid client"**
- Make sure you copied the full Client ID (ends with `.apps.googleusercontent.com`)
- Make sure there are no extra spaces in your `.env` file

**Can't see Client Secret again?**
- You'll need to create a new OAuth client ID
- The secret is only shown once when created

