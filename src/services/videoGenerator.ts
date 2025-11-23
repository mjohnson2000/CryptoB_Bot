import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { VideoScript } from './aiService.js';

const execAsync = promisify(exec);

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return new OpenAI({ apiKey });
}

export async function generateVideoWithAvatar(
  script: VideoScript,
  outputDir: string = './output'
): Promise<string> {
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Generate audio using OpenAI TTS
    const audioPath = await generateAudio(script.script, outputDir);

    // For now, we'll create a simple video with static avatar image
    // In production, you'd use a more sophisticated video generation tool
    const videoPath = await createVideoWithStaticAvatar(audioPath, outputDir);

    return videoPath;
  } catch (error) {
    console.error('Error generating video:', error);
    throw error;
  }
}

async function generateAudio(script: string, outputDir: string): Promise<string> {
  try {
    const audioPath = path.join(outputDir, `audio_${Date.now()}.mp3`);

    const openai = getOpenAIClient();
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova', // Young, energetic voice
      input: script,
      response_format: 'mp3'
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(audioPath, buffer);

    return audioPath;
  } catch (error) {
    console.error('Error generating audio:', error);
    throw error;
  }
}

async function createVideoWithStaticAvatar(
  audioPath: string,
  outputDir: string
): Promise<string> {
  const videoPath = path.join(outputDir, `video_${Date.now()}.mp4`);
  
  // Create avatar image first
  const avatarPath = await createAvatarImage(outputDir);
  
  // Get audio duration
  let duration = 60; // Default fallback
  try {
    const { stdout: durationOutput } = await execAsync(
      `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`
    );
    duration = parseFloat(durationOutput.trim()) || 60;
  } catch (error) {
    console.warn('Could not get audio duration, using default:', error);
  }
  
  // Create video using FFmpeg with enhanced quality
  // This creates a video with the avatar image, animated background, and audio
  const ffmpegCommand = `ffmpeg -y -loop 1 -i "${avatarPath}" -i "${audioPath}" ` +
    `-c:v libx264 -preset slow -crf 18 -tune stillimage -c:a aac -b:a 256k -ar 48000 -pix_fmt yuv420p ` +
    `-shortest -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0a0a1a,format=yuv420p" ` +
    `"${videoPath}"`;
  
  try {
    await execAsync(ffmpegCommand);
    console.log(`Video created successfully: ${videoPath}`);
    return videoPath;
  } catch (error) {
    console.error('FFmpeg error:', error);
    // If FFmpeg fails, return the audio path as fallback
    // In production, you'd want better error handling
    throw new Error('Failed to create video. Make sure FFmpeg is installed: https://ffmpeg.org/download.html');
  }
}

async function createAvatarImage(outputDir: string): Promise<string> {
  const avatarPath = path.join(outputDir, `avatar_${Date.now()}.png`);
  
  try {
    // Try Canvas first, fallback to Sharp
    try {
      const { createCanvas } = await import('canvas');
      const canvas = createCanvas(1280, 720);
      const ctx = canvas.getContext('2d');

      // Enhanced animated gradient background
      const gradient = ctx.createLinearGradient(0, 0, 1280, 720);
      gradient.addColorStop(0, '#0a0a1a');
      gradient.addColorStop(0.3, '#1a1a3e');
      gradient.addColorStop(0.7, '#2d1b4e');
      gradient.addColorStop(1, '#1a0a2e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1280, 720);

      // Add subtle pattern
      ctx.fillStyle = 'rgba(0, 255, 136, 0.03)';
      for (let i = 0; i < 20; i++) {
        ctx.fillRect(i * 64, 0, 2, 720);
      }

      // Draw avatar circle (Crypto B logo/avatar)
      const centerX = 640;
      const centerY = 300;
      const radius = 160;

      // Outer glow (enhanced)
      const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius + 40);
      glowGradient.addColorStop(0, 'rgba(0, 255, 136, 0.4)');
      glowGradient.addColorStop(0.5, 'rgba(0, 255, 136, 0.2)');
      glowGradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 40, 0, Math.PI * 2);
      ctx.fill();

      // Avatar circle with enhanced gradient
      const avatarGradient = ctx.createRadialGradient(centerX - 60, centerY - 60, 0, centerX, centerY, radius);
      avatarGradient.addColorStop(0, '#00ff88');
      avatarGradient.addColorStop(0.7, '#00cc6a');
      avatarGradient.addColorStop(1, '#009955');
      ctx.fillStyle = avatarGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();

      // Add inner highlight
      const highlightGradient = ctx.createRadialGradient(centerX - 40, centerY - 40, 0, centerX, centerY, radius * 0.6);
      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = highlightGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Draw "Crypto B" text on avatar with shadow
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.font = 'bold 130px Arial';
      ctx.fillText('CB', centerX + 3, centerY + 3);
      
      // Outline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.strokeText('CB', centerX, centerY);
      
      // Main text
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 130px Arial';
      ctx.fillText('CB', centerX, centerY);

      // Add "Crypto B" branding at bottom with glow effect
      ctx.shadowColor = 'rgba(0, 255, 136, 0.8)';
      ctx.shadowBlur = 25;
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 80px Arial';
      ctx.fillText('Crypto B', centerX, 600);
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Add subtitle
      ctx.fillStyle = 'rgba(0, 255, 136, 0.4)';
      ctx.font = '52px Arial';
      ctx.fillText('Latest Crypto Alpha', centerX, 660);

      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(avatarPath, buffer);

      return avatarPath;
    } catch (canvasError) {
      console.warn('Canvas not available for avatar, using Sharp fallback');
      // Use Sharp to create a simple avatar image
      const sharp = await import('sharp');
      // Escape XML entities in text
      const escapeXml = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };
      
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a1a;stop-opacity:1" />
      <stop offset="30%" style="stop-color:#1a1a3e;stop-opacity:1" />
      <stop offset="70%" style="stop-color:#2d1b4e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a0a2e;stop-opacity:1" />
    </linearGradient>
    <radialGradient id="avatarGrad" cx="50%" cy="50%">
      <stop offset="0%" style="stop-color:#00ff88;stop-opacity:1" />
      <stop offset="70%" style="stop-color:#00cc6a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#009955;stop-opacity:1" />
    </radialGradient>
    <radialGradient id="glowGrad" cx="50%" cy="50%">
      <stop offset="0%" style="stop-color:#00ff88;stop-opacity:0.4" />
      <stop offset="100%" style="stop-color:#00ff88;stop-opacity:0" />
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <ellipse cx="640" cy="300" rx="200" ry="200" fill="url(#glowGrad)"/>
  <circle cx="640" cy="300" r="160" fill="url(#avatarGrad)" filter="url(#glow)"/>
  <circle cx="640" cy="300" r="150" fill="url(#avatarGrad)"/>
  <text x="640" y="320" font-family="Arial, sans-serif" font-size="130" font-weight="bold" fill="#000000" text-anchor="middle" stroke="#ffffff" stroke-width="2">CB</text>
  <text x="640" y="600" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="#00ff88" text-anchor="middle" filter="url(#glow)">Crypto B</text>
  <text x="640" y="660" font-family="Arial, sans-serif" font-size="52" fill="rgba(0,255,136,0.4)" text-anchor="middle">Latest Crypto Alpha</text>
</svg>`;
      
      const sharpModule = await import('sharp');
      const sharpInstance = sharpModule.default || (sharpModule as any);
      await sharpInstance(Buffer.from(svg))
        .png()
        .toFile(avatarPath);
      
      return avatarPath;
    }
  } catch (error) {
    console.error('Error creating avatar:', error);
    throw error;
  }
}

export async function generateThumbnail(
  script: VideoScript,
  outputDir: string = './output'
): Promise<string> {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    
    const thumbnailPath = path.join(outputDir, `thumbnail_${Date.now()}.png`);

    // Try Canvas first, fallback to Sharp if Canvas fails
    try {
      const { createCanvas } = await import('canvas');
      const canvas = createCanvas(1280, 720);
      const ctx = canvas.getContext('2d');

      // Enhanced background with multiple gradients
      const bgGradient = ctx.createLinearGradient(0, 0, 1280, 720);
      bgGradient.addColorStop(0, '#0a0a1a');
      bgGradient.addColorStop(0.3, '#1a1a3e');
      bgGradient.addColorStop(0.7, '#2d1b4e');
      bgGradient.addColorStop(1, '#1a0a2e');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, 1280, 720);

      // Add subtle pattern overlay
      ctx.fillStyle = 'rgba(0, 255, 136, 0.05)';
      for (let i = 0; i < 20; i++) {
        ctx.fillRect(i * 64, 0, 2, 720);
      }

      // Add glow effect behind text area
      const glowGradient = ctx.createRadialGradient(640, 300, 0, 640, 300, 400);
      glowGradient.addColorStop(0, 'rgba(0, 255, 136, 0.2)');
      glowGradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
      ctx.fillStyle = glowGradient;
      ctx.fillRect(0, 0, 1280, 720);

      // Title text with shadow and outline for better readability
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Split title into multiple lines if needed
      const titleLines = wrapText(ctx, script.title, 1000);
      let yPos = 250;
      
      titleLines.forEach((line: string) => {
        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.font = 'bold 72px Arial';
        ctx.fillText(line, 644, yPos + 4);
        
        // Draw outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 8;
        ctx.strokeText(line, 640, yPos);
        
        // Draw main text with gradient
        const textGradient = ctx.createLinearGradient(340, yPos - 40, 940, yPos + 40);
        textGradient.addColorStop(0, '#ffffff');
        textGradient.addColorStop(0.5, '#00ff88');
        textGradient.addColorStop(1, '#ffffff');
        ctx.fillStyle = textGradient;
        ctx.font = 'bold 72px Arial';
        ctx.fillText(line, 640, yPos);
        
        yPos += 90;
      });

      // Add "Crypto B" branding with glow
      ctx.shadowColor = 'rgba(0, 255, 136, 0.8)';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 56px Arial';
      ctx.fillText('Crypto B', 640, 620);
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Save thumbnail
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(thumbnailPath, buffer);

      return thumbnailPath;
    } catch (canvasError) {
      console.warn('Canvas not available, using Sharp fallback:', canvasError);
      // Fallback to Sharp for simple thumbnail
      const sharp = await import('sharp');
      
      // Create a simple gradient thumbnail using Sharp
      // Escape XML entities in title
      const escapeXml = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };
      
      const safeTitle = escapeXml(script.title.substring(0, 40));
      
      // Enhanced SVG thumbnail with better visuals
      const titleWords = safeTitle.split(' ');
      const line1 = titleWords.slice(0, Math.ceil(titleWords.length / 2)).join(' ');
      const line2 = titleWords.slice(Math.ceil(titleWords.length / 2)).join(' ');
      
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a1a;stop-opacity:1" />
      <stop offset="30%" style="stop-color:#1a1a3e;stop-opacity:1" />
      <stop offset="70%" style="stop-color:#2d1b4e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a0a2e;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#00ff88;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1280" height="720" fill="url(#bgGrad)"/>
  <rect x="0" y="0" width="1280" height="720" fill="rgba(0,255,136,0.05)"/>
  <ellipse cx="640" cy="300" rx="400" ry="300" fill="rgba(0,255,136,0.15)"/>
  <text x="640" y="280" font-family="Arial, sans-serif" font-size="68" font-weight="bold" fill="url(#textGrad)" text-anchor="middle" filter="url(#glow)">
    <tspan x="640" dy="0">${line1}</tspan>
    <tspan x="640" dy="80">${line2 || ''}</tspan>
  </text>
  <text x="640" y="280" font-family="Arial, sans-serif" font-size="68" font-weight="bold" fill="none" stroke="#000000" stroke-width="3" text-anchor="middle">
    <tspan x="640" dy="0">${line1}</tspan>
    <tspan x="640" dy="80">${line2 || ''}</tspan>
  </text>
  <text x="640" y="620" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="#00ff88" text-anchor="middle" filter="url(#glow)">Crypto B</text>
</svg>`;
      
      const sharpModule = await import('sharp');
      const sharpInstance = sharpModule.default || (sharpModule as any);
      await sharpInstance(Buffer.from(svg))
        .png()
        .toFile(thumbnailPath);

      return thumbnailPath;
    }
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    throw error;
  }
}

function wrapText(
  ctx: any, // Canvas 2D context
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

