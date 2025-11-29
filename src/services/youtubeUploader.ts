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
            console.error(`\n❌ ERROR: Wrong channel detected!`);
            console.error(`   Target channel: "${targetChannel.snippet?.title}" (${targetChannel.id})`);
            console.error(`   Will upload to: "${channels[0]?.snippet?.title}" (${channels[0]?.id})`);
            console.error(`\n   To fix this:`);
            console.error(`   1. Make sure you're logged into the CORRECT channel in your browser`);
            console.error(`   2. Run: npm run setup:youtube`);
            console.error(`   3. When authorizing, make sure the correct channel is selected`);
            console.error(`   4. This will generate a new refresh token for the correct channel\n`);
            throw new Error(`Cannot upload to wrong channel. Please re-authenticate with the correct channel.`);
          }
        }
        
        // Warn if no channel ID is specified but multiple channels exist
        if (!process.env.YOUTUBE_CHANNEL_ID && channels.length > 1) {
          console.warn(`\n⚠️  Multiple channels detected. Videos will upload to: "${channels[0]?.snippet?.title}"`);
          console.warn(`   To upload to a different channel:`);
          console.warn(`   1. Get the channel ID from YouTube Studio`);
          console.warn(`   2. Add YOUTUBE_CHANNEL_ID=your-channel-id to your .env file`);
          console.warn(`   3. Re-authenticate: npm run setup:youtube (while logged into the correct channel)\n`);
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
        console.log('✅ Thumbnail uploaded successfully');
      } catch (error: any) {
        if (error?.response?.status === 403 || error?.code === 403) {
          console.warn('⚠️  Thumbnail upload failed: Channel does not have permission to upload custom thumbnails.');
          console.warn('   To fix this:');
          console.warn('   1. Verify your YouTube channel (phone verification may be required)');
          console.warn('   2. Go to YouTube Studio → Settings → Channel → Advanced settings');
          console.warn('   3. Enable "Allow custom thumbnails"');
          console.warn('   Video uploaded successfully, but using auto-generated thumbnail.');
        } else {
          console.error('❌ Error uploading thumbnail:', error?.message || error);
        }
        // Continue even if thumbnail upload fails
      }
    }

    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      success: true
    };
  } catch (error: any) {
    // Check if it's a quota exceeded error
    const isQuotaError = error?.message?.includes('quota') || 
                         error?.message?.includes('Quota') ||
                         error?.code === 403 ||
                         error?.response?.status === 403;
    
    if (isQuotaError) {
      const errorMessage = error?.response?.data?.error?.message || error?.message || 'Unknown quota error';
      if (errorMessage.includes('quota') || errorMessage.includes('Quota')) {
        console.error('\n❌ YouTube API Quota Exceeded!');
        console.error('   Your daily quota limit has been reached.');
        console.error('   Quota resets daily at midnight Pacific Time.');
        console.error('\n💡 To reduce quota usage:');
        console.error('   - Reduce automation frequency (increase cadence hours)');
        console.error('   - Reduce number of videos/comments fetched for deep dive topics');
        console.error('   - Wait for quota reset (midnight PT)');
        console.error('\n📊 Current quota usage: Check your Google Cloud Console');
        console.error('   https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas\n');
        throw new Error('YouTube API quota exceeded. Please wait for quota reset or reduce API usage.');
      }
    }
    
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

