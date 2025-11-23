# YouTube Upload Setup Guide

## Current Status
❌ **YouTube credentials not configured** - Uploads will fail until setup is complete

## Step-by-Step Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it (e.g., "YouTube Crypto Bot")
4. Click "Create"

### 2. Enable YouTube Data API v3

1. In your project, go to "APIs & Services" → "Library"
2. Search for "YouTube Data API v3"
3. Click on it and press "Enable"

### 3. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure OAuth consent screen:
   - User Type: External (or Internal if using Google Workspace)
   - App name: "Crypto B Bot" (or your choice)
   - User support email: Your email
   - Developer contact: Your email
   - Click "Save and Continue"
   - Scopes: Add `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube`
   - Click "Save and Continue"
   - Add test users if needed (for testing)
   - Click "Save and Continue"
4. Application type: "Web application"
5. Name: "Crypto B Bot"
6. Authorized redirect URIs: Add:
   ```
   http://localhost:3000/auth/youtube/callback
   ```
7. Click "Create"
8. **Copy the Client ID and Client Secret** (you'll need these)

### 4. Add Credentials to .env File

Add these lines to your `.env` file:

```env
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-client-secret
YOUTUBE_REDIRECT_URI=http://localhost:3000/auth/youtube/callback
```

### 5. Get Refresh Token

Run the setup script:

```bash
npm run setup:youtube
```

This will:
1. Generate an authorization URL
2. Open it in your browser (or copy/paste it)
3. Authorize the application
4. You'll be redirected to a URL with a `code` parameter
5. Copy the entire redirect URL
6. Paste the `code` value when prompted
7. The script will automatically save the refresh token to your `.env` file

### 6. Verify Setup

Check that everything is configured:

```bash
npm run verify
```

You should see:
- ✅ Environment variables configured
- ✅ YouTube credentials present

## Testing Upload

Once configured:
1. Create a video through the UI
2. Wait for it to complete
3. Click "Approve & Upload to YouTube"
4. The video will be uploaded to your YouTube channel!

## Troubleshooting

### "Invalid credentials" error
- Make sure Client ID and Secret are correct
- Check that YouTube Data API v3 is enabled
- Verify redirect URI matches exactly

### "Refresh token expired"
- Run `npm run setup:youtube` again to get a new token
- Make sure to use `prompt: consent` when authorizing

### "Access denied" error
- Check OAuth consent screen is configured
- Verify scopes include `youtube.upload` and `youtube`
- If in testing, add your email as a test user

## Important Notes

- The refresh token doesn't expire (unless revoked)
- Keep your credentials secure - never commit `.env` to git
- The redirect URI must match exactly what's in Google Cloud Console
- For production, you'll need to publish your OAuth app

