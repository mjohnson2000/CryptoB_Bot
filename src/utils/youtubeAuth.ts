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
  console.log('2. After clicking "Continue", you will be redirected.');
  console.log('3. IMPORTANT: Even if you see "This site can\'t be reached", look at the URL in your browser\'s address bar.');
  console.log('4. Copy the ENTIRE URL from the address bar (it will contain "code=...").\n');
  console.log('Example redirect URL:');
  console.log('http://localhost:3000/auth/youtube/callback?code=4/0A...\n');
  console.log('You can paste either:');
  console.log('  - The full URL (we\'ll extract the code automatically)');
  console.log('  - Just the code parameter\n');

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
    const input = await question('Enter the authorization code or full redirect URL: ');
    rl.close();
    
    // Extract code from URL if full URL was pasted
    let code = input.trim();
    if (code.includes('code=')) {
      const urlMatch = code.match(/[?&]code=([^&]+)/);
      if (urlMatch) {
        code = urlMatch[1];
        // Decode URL-encoded characters
        code = decodeURIComponent(code);
        console.log(`\n✅ Extracted and decoded code from URL`);
      }
    } else {
      // If just the code was pasted, still try to decode it in case it's URL-encoded
      try {
        code = decodeURIComponent(code);
      } catch (e) {
        // If decoding fails, use the original code
      }
    }

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
  } catch (error: any) {
    rl.close();
    console.error('\n❌ Error getting refresh token');
    
    if (error?.response?.data?.error === 'invalid_grant') {
      console.error('\n⚠️  The authorization code is invalid or expired.');
      console.error('   This usually happens if:');
      console.error('   1. The code expired (OAuth codes are only valid for ~10 minutes)');
      console.error('   2. The code was already used');
      console.error('   3. There\'s a redirect URI mismatch\n');
      console.error('   Solution:');
      console.error('   1. Run this script again: npm run setup:youtube');
      console.error('   2. Get a FRESH authorization code (authorize again)');
      console.error('   3. Paste the new code immediately\n');
    } else {
      console.error('Error details:', error?.message || error);
    }
    
    process.exit(1);
  }
}

getYouTubeRefreshToken().catch(console.error);
