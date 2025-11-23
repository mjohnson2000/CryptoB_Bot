import { google } from 'googleapis';
import fs from 'fs/promises';
import { VideoScript } from './aiService.js';

interface UploadResult {
  videoId: string;
  url: string;
  success: boolean;
}

export async function uploadToYouTube(
  videoPath: string,
  thumbnailPath: string,
  script: VideoScript
): Promise<UploadResult> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );

    // Set credentials using refresh token
    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
    });

    const youtube = google.youtube('v3');

    // Upload video
    const videoResponse = await youtube.videos.insert({
      auth: oauth2Client,
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: script.title,
          description: script.description,
          tags: script.tags,
          categoryId: '28', // Science & Technology
          defaultLanguage: 'en',
          defaultAudioLanguage: 'en'
        },
        status: {
          privacyStatus: 'public', // or 'unlisted', 'private'
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: await fs.readFile(videoPath)
      }
    });

    const videoId = videoResponse.data.id;
    if (!videoId) {
      throw new Error('Failed to get video ID from upload');
    }

    // Upload thumbnail
    if (thumbnailPath) {
      try {
        await youtube.thumbnails.set({
          auth: oauth2Client,
          videoId: videoId,
          media: {
            body: await fs.readFile(thumbnailPath)
          }
        });
      } catch (error) {
        console.error('Error uploading thumbnail:', error);
        // Continue even if thumbnail upload fails
      }
    }

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      success: true
    };
  } catch (error) {
    console.error('Error uploading to YouTube:', error);
    throw error;
  }
}

export async function getAuthUrl(): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );

  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  return url;
}

