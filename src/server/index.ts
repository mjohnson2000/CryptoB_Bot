import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { videoRouter } from './routes/video.js';

// Load .env file from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Log environment status (without exposing the key)
console.log('Environment loaded:', {
  hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  hasYouTubeClientId: !!process.env.YOUTUBE_CLIENT_ID,
  port: process.env.PORT || 3001
});

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';

app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from output directory
const outputDir = path.join(process.cwd(), 'output');
app.use('/output', express.static(outputDir));

app.use('/api/video', videoRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'YouTube Crypto Bot API is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

