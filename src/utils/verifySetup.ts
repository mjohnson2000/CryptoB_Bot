import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
}

export async function verifySetup(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Check .env file
  try {
    const envContent = await fs.readFile('.env', 'utf-8');
    const hasOpenAI = envContent.includes('OPENAI_API_KEY') && 
                     !envContent.includes('your_openai_api_key_here');
    const hasYouTube = envContent.includes('YOUTUBE_CLIENT_ID') && 
                      !envContent.includes('your_youtube_client_id');

    results.push({
      name: 'Environment Variables',
      status: hasOpenAI && hasYouTube ? 'ok' : 'warning',
      message: hasOpenAI && hasYouTube 
        ? 'Environment variables configured'
        : 'Please configure OPENAI_API_KEY and YouTube credentials in .env file'
    });
  } catch {
    results.push({
      name: 'Environment Variables',
      status: 'error',
      message: '.env file not found. Please create it from .env.example'
    });
  }

  // Check FFmpeg
  try {
    await execAsync('ffmpeg -version');
    results.push({
      name: 'FFmpeg',
      status: 'ok',
      message: 'FFmpeg is installed'
    });
  } catch {
    results.push({
      name: 'FFmpeg',
      status: 'error',
      message: 'FFmpeg not found. Install with: brew install ffmpeg (macOS) or see SETUP.md'
    });
  }

  // Check node_modules
  try {
    await fs.access('node_modules');
    await fs.access('client/node_modules');
    results.push({
      name: 'Dependencies',
      status: 'ok',
      message: 'All dependencies installed'
    });
  } catch {
    results.push({
      name: 'Dependencies',
      status: 'error',
      message: 'Dependencies not installed. Run: npm install && cd client && npm install'
    });
  }

  // Check OpenAI API key format
  try {
    const envContent = await fs.readFile('.env', 'utf-8');
    const openaiKey = envContent.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
    if (openaiKey && openaiKey.startsWith('sk-')) {
      results.push({
        name: 'OpenAI API Key Format',
        status: 'ok',
        message: 'OpenAI API key format looks correct'
      });
    } else if (openaiKey && !openaiKey.includes('your_')) {
      results.push({
        name: 'OpenAI API Key Format',
        status: 'warning',
        message: 'OpenAI API key may be invalid (should start with sk-)'
      });
    }
  } catch {
    // Already handled above
  }

  return results;
}

// Run if called directly
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(process.cwd(), ''));
if (isMainModule || process.argv[1]?.includes('verifySetup')) {
  verifySetup().then(results => {
    console.log('\n🔍 Setup Verification\n');
    results.forEach(result => {
      const icon = result.status === 'ok' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
      console.log(`${icon} ${result.name}: ${result.message}`);
    });
    console.log('');
    
    const hasErrors = results.some(r => r.status === 'error');
    if (hasErrors) {
      console.log('❌ Some checks failed. Please fix the issues above.\n');
      process.exit(1);
    } else {
      console.log('✅ Setup looks good! You can run "npm run dev" to start the application.\n');
    }
  }).catch(console.error);
}

