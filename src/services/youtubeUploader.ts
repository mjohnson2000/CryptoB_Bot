import { google } from 'googleapis';
import fs from 'fs';
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

    // Check which channel we're authenticated with
    try {
      const channelsResponse = await youtube.channels.list({
        auth: oauth2Client,
        part: ['snippet', 'id'],
        mine: true
      });
      
      if (channelsResponse.data.items && channelsResponse.data.items.length > 0) {
        const channels = channelsResponse.data.items;
        console.log(`📺 Found ${channels.length} channel(s) for this account:`);
        channels.forEach((channel, index) => {
          const isDefault = index === 0;
          console.log(`  ${isDefault ? '→' : ' '} ${channel.snippet?.title || 'Unknown'} (${channel.id}) ${isDefault ? '[DEFAULT - videos will upload here]' : ''}`);
        });
        
        // If channel ID is specified, verify it matches
        if (process.env.YOUTUBE_CHANNEL_ID) {
          const targetChannel = channels.find(c => c.id === process.env.YOUTUBE_CHANNEL_ID);
          if (!targetChannel) {
            console.warn(`⚠️  Warning: Specified channel ID ${process.env.YOUTUBE_CHANNEL_ID} not found. Uploading to default channel.`);
          } else if (targetChannel.id !== channels[0]?.id) {
            console.warn(`⚠️  Warning: Target channel "${targetChannel.snippet?.title}" is not the default channel.`);
            console.warn(`   Videos will upload to: "${channels[0]?.snippet?.title}" (default channel)`);
            console.warn(`   To fix: Set "${targetChannel.snippet?.title}" as your default channel in YouTube Studio`);
          }
        }
      }
    } catch (error) {
      console.warn('Could not verify channel information:', error);
    }

    // Upload video
    // Note: For accounts with multiple channels, videos upload to the DEFAULT channel
    // To change which channel receives uploads, set it as default in YouTube Studio
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
        body: fs.createReadStream(videoPath)
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
            body: fs.createReadStream(thumbnailPath)
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

