# YouTube Crypto Bot

Automated bot that creates YouTube videos about the latest crypto news. The bot searches for trending crypto topics from the last 4 hours, distills them into top 3-4 stories, and generates a complete video with avatar, thumbnail, title, description, and tags.

## Features

- 🔍 Web scraping for latest crypto news (last 4 hours)
- 🤖 AI-powered content generation (OpenAI)
- 🎬 Automated video creation with avatar "Crypto B"
- 🖼️ Thumbnail generation
- 📺 YouTube upload automation
- 🎨 Modern React UI

## Setup

1. Install dependencies:
```bash
npm install
cd client && npm install
```

2. Copy `.env.example` to `.env` and fill in your API keys:
   - OpenAI API Key
   - YouTube API credentials

3. Run the development server:
```bash
npm run dev
```

## Configuration

### OpenAI API
Get your API key from https://platform.openai.com/api-keys

### YouTube API
1. Go to Google Cloud Console
2. Create a new project
3. Enable YouTube Data API v3
4. Create OAuth 2.0 credentials
5. Follow the OAuth flow to get refresh token

## Usage

1. Start the application
2. Open the UI in your browser (http://localhost:5174)
3. Click "Create Video" button
4. Wait for the bot to:
   - Scrape latest crypto news
   - Generate script
   - Create video with avatar
   - Generate thumbnail
   - Upload to YouTube

## Project Structure

```
├── src/
│   ├── server/          # Express backend
│   ├── services/        # Business logic services
│   └── utils/           # Utility functions
├── client/              # React frontend
└── output/              # Generated videos and assets
```

