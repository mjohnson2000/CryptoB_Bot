import { google } from 'googleapis';
import readline from 'readline';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

async function getYouTubeRefreshToken(): Promise<void> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/auth/youtube/callback';

  if (!clientId || !clientSecret) {
    console.error('❌ Error: YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set in .env file');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  console.log('\n🔐 YouTube OAuth Setup\n');
  console.log('1. Visit this URL to authorize the application:');
  console.log(`\n${authUrl}\n`);
  console.log('2. After authorization, you will be redirected to a URL.');
  console.log('3. Copy the "code" parameter from that URL.\n');
  console.log('Example redirect URL:');
  console.log('http://localhost:3000/auth/youtube/callback?code=4/0A...\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    const code = await question('Enter the authorization code: ');
    rl.close();

    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      throw new Error('No refresh token received. Make sure to use "prompt: consent" in the auth URL.');
    }

    console.log('\n✅ Refresh token obtained!');
    
    // Update .env file
    const envPath = path.join(process.cwd(), '.env');
    let envContent = await fs.readFile(envPath, 'utf-8').catch(() => '');
    
    if (envContent.includes('YOUTUBE_REFRESH_TOKEN=')) {
      envContent = envContent.replace(
        /YOUTUBE_REFRESH_TOKEN=.*/,
        `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`
      );
    } else {
      envContent += `\nYOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }
    
    await fs.writeFile(envPath, envContent);
    
    console.log('✅ Refresh token saved to .env file');
    console.log('\nYou can now use the bot to upload videos to YouTube!\n');
  } catch (error) {
    rl.close();
    console.error('\n❌ Error getting refresh token:', error);
    process.exit(1);
  }
}

getYouTubeRefreshToken().catch(console.error);
