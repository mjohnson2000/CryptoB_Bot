import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

async function checkYouTubeChannel() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
    });

    const youtube = google.youtube('v3');

    const channelsResponse = await youtube.channels.list({
      auth: oauth2Client,
      part: ['snippet', 'id'],
      mine: true
    });

    if (channelsResponse.data.items && channelsResponse.data.items.length > 0) {
      const channels = channelsResponse.data.items;
      console.log('\n📺 YouTube Channel Verification\n');
      console.log(`Found ${channels.length} channel(s) for this account:\n`);
      
      channels.forEach((channel, index) => {
        const isDefault = index === 0;
        const channelId = channel.id || 'Unknown';
        const channelName = channel.snippet?.title || 'Unknown';
        
        console.log(`${isDefault ? '→' : ' '} ${channelName}`);
        console.log(`   Channel ID: ${channelId}`);
        console.log(`   ${isDefault ? '✅ This is the DEFAULT channel - videos will upload here' : '   (Not the default channel)'}`);
        console.log('');
      });

      if (process.env.YOUTUBE_CHANNEL_ID) {
        const targetChannel = channels.find(c => c.id === process.env.YOUTUBE_CHANNEL_ID);
        if (!targetChannel) {
          console.log(`⚠️  WARNING: YOUTUBE_CHANNEL_ID in .env (${process.env.YOUTUBE_CHANNEL_ID})`);
          console.log(`   does not match any of your channels!\n`);
        } else if (targetChannel.id !== channels[0]?.id) {
          console.log(`❌ MISMATCH DETECTED:`);
          console.log(`   Your .env specifies: "${targetChannel.snippet?.title}" (${targetChannel.id})`);
          console.log(`   But videos will upload to: "${channels[0]?.snippet?.title}" (${channels[0]?.id})\n`);
          console.log(`   To fix:`);
          console.log(`   1. Open YouTube Studio in your browser`);
          console.log(`   2. Make sure you're logged into the CORRECT channel`);
          console.log(`   3. Run: npm run setup:youtube`);
          console.log(`   4. Re-authorize while logged into the correct channel\n`);
        } else {
          console.log(`✅ Channel match! Videos will upload to: "${targetChannel.snippet?.title}"\n`);
        }
      } else {
        console.log(`ℹ️  Tip: Add YOUTUBE_CHANNEL_ID to your .env file to verify the correct channel\n`);
      }
    } else {
      console.log('❌ No channels found for this account');
    }
  } catch (error: any) {
    console.error('\n❌ Error checking YouTube channel:', error.message);
    if (error.message?.includes('invalid_grant') || error.message?.includes('Invalid Credentials')) {
      console.error('\n   Your refresh token may be invalid or expired.');
      console.error('   Run: npm run setup:youtube to get a new token\n');
    }
  }
}

checkYouTubeChannel().catch(console.error);

