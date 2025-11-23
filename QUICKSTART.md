# Quick Start Guide

## 1. Install Dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..
```

## 2. Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html and add to PATH

**Linux:**
```bash
sudo apt install ffmpeg
```

## 3. Configure Environment

1. Copy `.env.example` to `.env`
2. Add your OpenAI API key:
   ```env
   OPENAI_API_KEY=sk-your-key-here
   ```

3. Set up YouTube API:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create project → Enable YouTube Data API v3
   - Create OAuth 2.0 credentials
   - Add to `.env`:
     ```env
     YOUTUBE_CLIENT_ID=your-client-id
     YOUTUBE_CLIENT_SECRET=your-client-secret
     YOUTUBE_REDIRECT_URI=http://localhost:3000/auth/youtube/callback
     ```

4. Get YouTube refresh token:
   ```bash
   npm run setup:youtube
   ```

## 4. Run the Application

```bash
npm run dev
```

Open http://localhost:5174 and click "Create Video"!

## Features

✅ Scrapes latest crypto news (last 4 hours)  
✅ AI-powered topic distillation  
✅ Generates engaging scripts for "Crypto B"  
✅ Creates video with avatar and TTS  
✅ Generates thumbnails  
✅ Auto-uploads to YouTube  

## Troubleshooting

- **FFmpeg not found**: Make sure FFmpeg is installed and in PATH
- **Canvas errors**: Install system dependencies (see SETUP.md)
- **YouTube upload fails**: Check OAuth credentials and API enablement

