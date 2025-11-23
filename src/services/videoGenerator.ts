import OpenAI from 'openai';
import fs from 'fs/promises';
import fsSync from 'fs';
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

    // Generate word-level timestamps using Whisper
    const subtitlePath = await generateSubtitlesWithTimestamps(audioPath, script.script, outputDir);

    // Create video with captions and on-screen text overlays
    const videoPath = await createVideoWithStaticAvatar(audioPath, subtitlePath, script, outputDir);

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

async function generateSubtitlesWithTimestamps(
  audioPath: string,
  script: string,
  outputDir: string
): Promise<string> {
  try {
    const subtitlePath = path.join(outputDir, `subtitles_${Date.now()}.ass`);
    
    // Use OpenAI Whisper to get word-level timestamps
    const openai = getOpenAIClient();
    
    // Read file as Buffer and create File object
    // OpenAI SDK in Node.js accepts File objects created from Buffer
    const audioBuffer = await fs.readFile(audioPath);
    
    // Create File object (available in Node.js 18+)
    // If File is not available, we'll use a polyfill approach
    let audioFile: any;
    if (typeof File !== 'undefined') {
      audioFile = new File([audioBuffer], path.basename(audioPath), { type: 'audio/mpeg' });
    } else {
      // Fallback: create a file-like object
      audioFile = {
        name: path.basename(audioPath),
        type: 'audio/mpeg',
        stream: () => {
          const { Readable } = require('stream');
          return Readable.from([audioBuffer]);
        },
        arrayBuffer: async () => audioBuffer.buffer,
        text: async () => '',
        size: audioBuffer.length
      };
    }
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word']
    });

    // Create ASS subtitle file with word-by-word highlighting
    const assContent = generateASSFile(transcription, script);
    await fs.writeFile(subtitlePath, assContent);

    return subtitlePath;
  } catch (error) {
    console.warn('Error generating subtitles with Whisper, using fallback:', error);
    // Fallback: create simple subtitles without word-level timing
    return await generateSimpleSubtitles(script, outputDir);
  }
}

async function generateSimpleSubtitles(
  script: string,
  outputDir: string
): Promise<string> {
  const subtitlePath = path.join(outputDir, `subtitles_${Date.now()}.ass`);
  
  // Estimate timing: ~150 words per minute
  const words = script.split(/\s+/);
  const wordsPerMinute = 150;
  const secondsPerWord = 60 / wordsPerMinute;
  
  let currentTime = 0;
  const lines: string[] = [];
  
  // Group words into lines (max 8 words per line)
  for (let i = 0; i < words.length; i += 8) {
    const lineWords = words.slice(i, i + 8);
    const startTime = currentTime;
    const endTime = currentTime + (lineWords.length * secondsPerWord);
    
    lines.push(formatASSLine(startTime, endTime, lineWords.join(' '), i));
    currentTime = endTime;
  }
  
  const assContent = generateASSHeader() + lines.join('\n');
  await fs.writeFile(subtitlePath, assContent);
  
  return subtitlePath;
}

/**
 * Match Whisper words with original script to add punctuation
 * This ensures captions have proper punctuation (commas, periods, etc.)
 */
function addPunctuationFromScript(whisperWords: any[], script: string): any[] {
  // Split script into words while preserving punctuation attached to words
  // This regex splits on spaces but keeps punctuation with words
  const scriptWords = script.split(/\s+/).filter(w => w.length > 0);
  
  // Match Whisper words with script words
  let scriptIndex = 0;
  const matchedWords: any[] = [];
  
  whisperWords.forEach((whisperWord: any) => {
    const whisperText = whisperWord.word.toLowerCase().trim().replace(/[^\w]/g, '');
    if (!whisperText) {
      matchedWords.push(whisperWord);
      return;
    }
    
    // Search forward in script for matching word (within next 10 words)
    let bestMatch: { word: string; index: number; score: number } | null = null;
    const searchWindow = Math.min(scriptIndex + 10, scriptWords.length);
    
    for (let i = scriptIndex; i < searchWindow; i++) {
      const scriptWord = scriptWords[i];
      const scriptNormalized = scriptWord.toLowerCase().replace(/[^\w]/g, '');
      
      // Calculate match score (exact match = highest score)
      let score = 0;
      if (scriptNormalized === whisperText) {
        score = 100; // Exact match
      } else if (scriptNormalized.startsWith(whisperText) || whisperText.startsWith(scriptNormalized)) {
        score = 80; // Prefix match
      } else if (scriptNormalized.includes(whisperText) || whisperText.includes(scriptNormalized)) {
        score = 50; // Partial match
      }
      
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { word: scriptWord, index: i, score };
      }
    }
    
    if (bestMatch && bestMatch.score >= 50) {
      // Use script word with punctuation
      matchedWords.push({
        ...whisperWord,
        word: bestMatch.word,
        originalWord: whisperWord.word
      });
      scriptIndex = bestMatch.index + 1;
    } else {
      // No good match - keep original word
      // But preserve any punctuation that Whisper might have included
      matchedWords.push({
        ...whisperWord,
        word: whisperWord.word,
        originalWord: whisperWord.word
      });
    }
  });
  
  return matchedWords;
}

function generateASSFile(transcription: any, script: string): string {
  const header = generateASSHeader();
  const lines: string[] = [];
  
  if (transcription.words && Array.isArray(transcription.words)) {
    // Add punctuation from original script
    const wordsWithPunctuation = addPunctuationFromScript(transcription.words, script);
    
    // Use word-level timestamps from Whisper (now with punctuation)
    let currentLine: string[] = [];
    let lineStartTime = wordsWithPunctuation[0]?.start || 0;
    let lineEndTime = lineStartTime;
    let wordIndices: number[] = [];
    
    // Store line data before converting to ASS format (so we can modify end times)
    const lineData: Array<{
      start: number;
      end: number;
      text: string;
      words: any[];
    }> = [];
    
    // Track active lines to ensure max 3 lines displayed at once
    const activeLines: Array<{ start: number; end: number; lineIndex: number }> = [];
    const MAX_LINES = 3;
    
    wordsWithPunctuation.forEach((word: any, index: number) => {
      // Use word with punctuation from script
      let wordText = word.word || word.originalWord || word.word;
      wordText = wordText.replace(/^\s+|\s+$/g, '');
      if (!wordText) return;
      
      currentLine.push(wordText);
      wordIndices.push(index);
      lineEndTime = word.end || lineEndTime;
      
      // Create a new line every 8 words or when we hit sentence-ending punctuation
      if (currentLine.length >= 8 || wordText.match(/[.!?]$/)) {
        const currentTime = word.end || lineEndTime;
        
        // Remove lines that have already ended
        for (let i = activeLines.length - 1; i >= 0; i--) {
          if (activeLines[i].end <= currentTime) {
            activeLines.splice(i, 1);
          }
        }
        
        // If we're at max lines, end the oldest active line before starting new one
        if (activeLines.length >= MAX_LINES) {
          // Find the oldest active line (earliest start time)
          const oldestLine = activeLines.reduce((oldest, current) => 
            current.start < oldest.start ? current : oldest
          );
          
          // Update the oldest line's end time to end before new line starts
          const newEndTime = Math.max(oldestLine.start, currentTime - 0.15);
          lineData[oldestLine.lineIndex].end = newEndTime;
          oldestLine.end = newEndTime;
          
          // Remove from active lines (it will be replaced by new line)
          const oldestIndex = activeLines.findIndex(l => l.lineIndex === oldestLine.lineIndex);
          if (oldestIndex >= 0) {
            activeLines.splice(oldestIndex, 1);
          }
        }
        
        // Join words with proper spacing and punctuation
        const lineText = currentLine.join(' ');
        const lineWords = wordIndices.map(i => wordsWithPunctuation[i]);
        
        // Add small gap before next line starts (for smoother fade transitions)
        const nextLineStart = currentTime + 0.1;
        
        // Store line data
        const lineIndex = lineData.length;
        lineData.push({
          start: lineStartTime,
          end: lineEndTime,
          text: lineText,
          words: lineWords
        });
        
        // Track this line as active
        activeLines.push({ 
          start: lineStartTime, 
          end: lineEndTime,
          lineIndex: lineIndex
        });
        
        currentLine = [];
        wordIndices = [];
        lineStartTime = nextLineStart;
      }
    });
    
    // Add remaining words
    if (currentLine.length > 0) {
      const lineWords = wordIndices.map(i => wordsWithPunctuation[i]);
      const finalLineText = currentLine.join(' ');
      lineData.push({
        start: lineStartTime,
        end: lineEndTime,
        text: finalLineText,
        words: lineWords
      });
    }
    
    // Convert all line data to ASS format
    lineData.forEach((line) => {
      lines.push(formatASSLineWithWords(
        line.start,
        line.end,
        line.text,
        line.words
      ));
    });
  } else {
    // Fallback: create simple subtitles without word-level timing
    const words = script.split(/\s+/);
    const wordsPerMinute = 150;
    const secondsPerWord = 60 / wordsPerMinute;
    let currentTime = 0;
    
    for (let i = 0; i < words.length; i += 8) {
      const lineWords = words.slice(i, i + 8);
      const startTime = currentTime;
      const endTime = currentTime + (lineWords.length * secondsPerWord);
      lines.push(formatASSLine(startTime, endTime, lineWords.join(' '), i));
      currentTime = endTime;
    }
  }
  
  return header + lines.join('\n');
}

function generateASSHeader(): string {
  return `[Script Info]
Title: Crypto B Video Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,52,&Hffffff,&H1A93F7,&H000000,&HC0000000,1,0,0,0,100,100,0,0,1,4,2,2,10,10,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

function formatASSLine(start: number, end: number, text: string, wordIndex: number): string {
  const startTime = formatASSTime(start);
  const endTime = formatASSTime(end);
  const escapedText = text.replace(/\n/g, '\\N').replace(/,/g, '\\,');
  return `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${escapedText}`;
}

function formatASSLineWithWords(start: number, end: number, lineText: string, words: any[]): string {
  const startTime = formatASSTime(start);
  const endTime = formatASSTime(end);
  
  // Calculate fade durations (in centiseconds)
  // Fade in: 200ms (20 centiseconds) for smooth entry
  // Fade out: 300ms (30 centiseconds) for smooth exit
  const fadeInDuration = 20; // 0.2 seconds
  const fadeOutDuration = 30; // 0.3 seconds
  
  // Total line duration in centiseconds
  const lineDuration = (end - start) * 100;
  
  // Ensure fade durations don't exceed line duration
  const actualFadeIn = Math.min(fadeInDuration, lineDuration * 0.2);
  const actualFadeOut = Math.min(fadeOutDuration, lineDuration * 0.3);
  
  // Create word-by-word highlighting using ASS karaoke tags
  // ASS karaoke format: {\k<duration>} highlights text for duration in centiseconds
  let highlightedText = '';
  let cumulativeTime = 0;
  
  words.forEach((word, index) => {
    const wordStart = word.start || (start + cumulativeTime);
    const wordEnd = word.end || (wordStart + 0.5);
    // Use word with punctuation (from script matching)
    let wordText = word.word || word.originalWord || word.word || '';
    // Remove only leading/trailing spaces, but keep punctuation attached to the word
    wordText = wordText.replace(/^\s+|\s+$/g, '');
    if (!wordText) return; // Skip empty words
    const wordDuration = (wordEnd - wordStart) * 100; // Convert to centiseconds
    
    // Calculate pause before this word
    let pauseDuration = 0;
    if (index > 0) {
      const prevWordEnd = words[index - 1].end || wordStart;
      pauseDuration = (wordStart - prevWordEnd) * 100;
    }
    
    // Add pause if needed, but don't add space if punctuation is attached to previous word
    if (pauseDuration > 10) {
      highlightedText += `{\\k${Math.round(pauseDuration)}}`;
      // Only add space if this word doesn't start with punctuation
      if (!wordText.match(/^[.,!?;:]/)) {
        highlightedText += ' ';
      }
    } else if (index > 0) {
      // Check if previous word ended with punctuation - if so, no space needed
      const prevWord = words[index - 1]?.word || '';
      if (!prevWord.match(/[.,!?;:]$/)) {
        highlightedText += ' ';
      }
    }
    
    // Highlight current word in Bitcoin orange (#F7931A = &H1A93F7), then switch back to white
    highlightedText += `{\\k${Math.round(wordDuration)}\\c&H1A93F7&}${wordText}{\\c&HFFFFFF&}`;
    
    cumulativeTime = wordEnd - start;
  });
  
  // Escape special characters for ASS format
  highlightedText = highlightedText.replace(/\n/g, '\\N');
  
  // Add fade effect: {\fad(fade_in, fade_out)}
  // Apply fade at the beginning of the line
  const fadedText = `{\\fad(${Math.round(actualFadeIn)},${Math.round(actualFadeOut)})}${highlightedText}`;
  
  return `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${fadedText}`;
}

function formatASSTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);
  
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout: durationOutput } = await execAsync(
      `ffprobe -i "${videoPath}" -show_entries format=duration -v quiet -of csv="p=0"`
    );
    return parseFloat(durationOutput.trim()) || 0;
  } catch (error) {
    console.warn('Could not get video duration:', error);
    return 0;
  }
}

async function createVideoWithStaticAvatar(
  audioPath: string,
  subtitlePath: string,
  script: VideoScript,
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
  
  // Parse script to estimate when price/NFT sections occur
  // Estimate: intro ~15s, price ~30s, news ~2-3min, NFT ~30s, outro ~15s
  const introEnd = 15;
  const priceStart = introEnd;
  const priceEnd = priceStart + 30;
  const nftStart = Math.max(duration - 45, duration * 0.85); // Last 30-45 seconds
  const nftEnd = duration - 15;
  
  // Helper function to escape text for FFmpeg drawtext
  const escapeText = (text: string): string => {
    return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
  };

  // Build text overlay filters for price data
  // Position titles near top (y=60-80) to avoid overlap with captions at bottom (y~640)
  let priceOverlays: string[] = [];
  if (script.priceUpdate && script.priceUpdate.topWinners.length > 0) {
    // Market sentiment label (top) - Bitcoin orange - moved to top
    const sentimentText = escapeText(`Market: ${script.priceUpdate.marketSentiment.toUpperCase()}`);
    priceOverlays.push(
      `drawtext=text='${sentimentText}':fontsize=36:fontcolor=0xF7931A:x=(w-text_w)/2:y=60:enable='between(t\\,${priceStart}\\,${priceEnd})'`
    );
    
    // Winners section (below title) - Green
    const winners = script.priceUpdate.topWinners.slice(0, 3);
    winners.forEach((winner, index) => {
      const yPos = 120 + (index * 60); // Start below title
      const text = escapeText(`${winner.symbol}  +${winner.change24h.toFixed(1)}%`);
      priceOverlays.push(
        `drawtext=text='${text}':fontsize=48:fontcolor=0x00FF00:x=(w-text_w)/2:y=${yPos}:enable='between(t\\,${priceStart}\\,${priceEnd})'`
      );
    });
    
    // Losers section (below winners) - Red
    const losers = script.priceUpdate.topLosers.slice(0, 3);
    losers.forEach((loser, index) => {
      const yPos = 300 + (index * 60); // Positioned below winners
      const text = escapeText(`${loser.symbol}  ${loser.change24h.toFixed(1)}%`);
      priceOverlays.push(
        `drawtext=text='${text}':fontsize=48:fontcolor=0xFF0000:x=(w-text_w)/2:y=${yPos}:enable='between(t\\,${priceStart}\\,${priceEnd})'`
      );
    });
  }
  
  // Build text overlay filters for NFT data
  // Position titles near top (y=60-80) to avoid overlap with captions at bottom (y~640)
  let nftOverlays: string[] = [];
  if (script.nftUpdate && script.nftUpdate.trendingCollections.length > 0) {
    // NFT label - Bitcoin orange - moved to top
    nftOverlays.push(
      `drawtext=text='TRENDING NFTs':fontsize=48:fontcolor=0xF7931A:x=(w-text_w)/2:y=60:enable='between(t\\,${nftStart}\\,${nftEnd})'`
    );
    
    const nfts = script.nftUpdate.trendingCollections.slice(0, 3);
    nfts.forEach((nft, index) => {
      const yPos = 120 + (index * 80); // Start below title
      const changeText = nft.floorPriceChange24h > 0 ? `+${nft.floorPriceChange24h.toFixed(1)}%` : `${nft.floorPriceChange24h.toFixed(1)}%`;
      const text = escapeText(`${nft.name}: ${nft.floorPrice.toFixed(2)} ETH (${changeText})`);
      const color = nft.floorPriceChange24h > 0 ? '0x00FF00' : '0xFF0000';
      nftOverlays.push(
        `drawtext=text='${text}':fontsize=42:fontcolor=${color}:x=(w-text_w)/2:y=${yPos}:enable='between(t\\,${nftStart}\\,${nftEnd})'`
      );
    });
  }
  
  // Combine all overlays
  const allOverlays = [...priceOverlays, ...nftOverlays];
  
  // Create video using FFmpeg with subtitles and text overlays
  // Escape paths properly for shell
  const escapedSubtitlePath = subtitlePath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const escapedAvatarPath = avatarPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
  const escapedAudioPath = audioPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
  const escapedVideoPath = videoPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
  
  // Build filter chain: scale/pad -> text overlays -> subtitles
  let filterChain = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0a';
  if (allOverlays.length > 0) {
    filterChain += ',' + allOverlays.join(',');
  }
  filterChain += `,subtitles='${escapedSubtitlePath}':force_style='Alignment=2,MarginV=80,Outline=4,Shadow=2,FontSize=52,Bold=1,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BackColour=&HC0000000,SecondaryColour=&H1A93F7',format=yuv420p`;
  
  const ffmpegCommand = `ffmpeg -y -loop 1 -i "${escapedAvatarPath}" -i "${escapedAudioPath}" ` +
    `-vf "${filterChain}" ` +
    `-c:v libx264 -preset slow -crf 18 -tune stillimage -c:a aac -b:a 256k -ar 48000 -pix_fmt yuv420p ` +
    `-shortest "${escapedVideoPath}"`;
  
  try {
    console.log('🎬 Creating video with FFmpeg...');
    console.log(`Filter chain length: ${filterChain.length} characters`);
    if (allOverlays.length > 0) {
      console.log(`📊 Adding ${allOverlays.length} text overlays (${priceOverlays.length} price, ${nftOverlays.length} NFT)`);
    }
    const result = await execAsync(ffmpegCommand);
    if (result.stderr) {
      // FFmpeg outputs to stderr even on success, so only log if there's actual error content
      const errorLines = result.stderr.split('\n').filter((line: string) => 
        line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')
      );
      if (errorLines.length > 0) {
        console.warn('FFmpeg warnings:', errorLines.join('\n'));
      }
    }
    console.log(`✅ Video created successfully with captions and overlays: ${videoPath}`);
    return videoPath;
  } catch (error: any) {
    console.error('❌ FFmpeg error:', error);
    const errorMessage = error?.stderr || error?.message || String(error);
    console.error('Full error details:', errorMessage);
    throw new Error(`Failed to create video: ${errorMessage.substring(0, 200)}. Make sure FFmpeg is installed: https://ffmpeg.org/download.html`);
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

      // MATCH THUMBNAIL STYLE: Dark gradient background
      const bgGradient = ctx.createLinearGradient(0, 0, 1280, 720);
      bgGradient.addColorStop(0, '#0a0a0a');
      bgGradient.addColorStop(0.5, '#1a1a2e');
      bgGradient.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, 1280, 720);
      
      // Add Bitcoin orange accent in top right corner (matching thumbnail)
      const accentGradient = ctx.createRadialGradient(1100, 100, 0, 1100, 100, 300);
      accentGradient.addColorStop(0, 'rgba(247, 147, 26, 0.4)');
      accentGradient.addColorStop(1, 'rgba(247, 147, 26, 0)');
      ctx.fillStyle = accentGradient;
      ctx.fillRect(800, 0, 480, 300);
      
      // Add subtle grid pattern (matching thumbnail - Bitcoin orange)
      ctx.fillStyle = 'rgba(247, 147, 26, 0.05)';
      for (let i = 0; i < 1280; i += 50) {
        ctx.fillRect(i, 0, 1, 720);
      }
      for (let i = 0; i < 720; i += 50) {
        ctx.fillRect(0, i, 1280, 1);
      }

      // Draw avatar circle (Crypto B logo/avatar)
      const centerX = 640;
      const centerY = 300;
      const radius = 160;

      // Outer glow (enhanced) - Bitcoin orange
      const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius + 40);
      glowGradient.addColorStop(0, 'rgba(247, 147, 26, 0.5)');
      glowGradient.addColorStop(0.5, 'rgba(247, 147, 26, 0.25)');
      glowGradient.addColorStop(1, 'rgba(247, 147, 26, 0)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 40, 0, Math.PI * 2);
      ctx.fill();

      // Avatar circle with Bitcoin orange gradient
      const avatarGradient = ctx.createRadialGradient(centerX - 60, centerY - 60, 0, centerX, centerY, radius);
      avatarGradient.addColorStop(0, '#F7931A'); // Bitcoin orange
      avatarGradient.addColorStop(0.7, '#E8821A'); // Darker orange
      avatarGradient.addColorStop(1, '#D6711A'); // Deep orange
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

      // MATCH THUMBNAIL STYLE: "Crypto B" branding - simple white text (matching thumbnail)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 60px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      // Thin black outline (matching thumbnail style)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText('₿ Crypto B', centerX, 680);
      
      // White text
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('₿ Crypto B', centerX, 680);

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
      <stop offset="0%" style="stop-color:#0a0a0a;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
    </linearGradient>
    <radialGradient id="accentGrad" cx="86%" cy="14%">
      <stop offset="0%" style="stop-color:#F7931A;stop-opacity:0.4" />
      <stop offset="100%" style="stop-color:#F7931A;stop-opacity:0" />
    </radialGradient>
            <radialGradient id="avatarGrad" cx="50%" cy="50%">
              <stop offset="0%" style="stop-color:#F7931A;stop-opacity:1" />
              <stop offset="70%" style="stop-color:#E8821A;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#D6711A;stop-opacity:1" />
            </radialGradient>
            <radialGradient id="glowGrad" cx="50%" cy="50%">
              <stop offset="0%" style="stop-color:#F7931A;stop-opacity:0.5" />
              <stop offset="100%" style="stop-color:#F7931A;stop-opacity:0" />
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
  <ellipse cx="1100" cy="100" rx="300" ry="300" fill="url(#accentGrad)"/>
  <ellipse cx="640" cy="300" rx="200" ry="200" fill="url(#glowGrad)"/>
  <circle cx="640" cy="300" r="160" fill="url(#avatarGrad)" filter="url(#glow)"/>
  <circle cx="640" cy="300" r="150" fill="url(#avatarGrad)"/>
  <text x="640" y="320" font-family="Arial, sans-serif" font-size="130" font-weight="bold" fill="#000000" text-anchor="middle" stroke="#ffffff" stroke-width="2">CB</text>
  <text x="640" y="680" font-family="Arial, sans-serif" font-size="60" font-weight="bold" fill="#FFFFFF" text-anchor="middle" stroke="#000000" stroke-width="3">₿ Crypto B</text>
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

      // PROVEN STYLE: Dark background with Bitcoin orange accent
      // Solid dark background for maximum contrast
      const bgGradient = ctx.createLinearGradient(0, 0, 1280, 720);
      bgGradient.addColorStop(0, '#0a0a0a');
      bgGradient.addColorStop(0.5, '#1a1a2e');
      bgGradient.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, 1280, 720);
      
      // Add Bitcoin orange accent in top right corner
      const accentGradient = ctx.createRadialGradient(1100, 100, 0, 1100, 100, 300);
      accentGradient.addColorStop(0, 'rgba(247, 147, 26, 0.4)');
      accentGradient.addColorStop(1, 'rgba(247, 147, 26, 0)');
      ctx.fillStyle = accentGradient;
      ctx.fillRect(800, 0, 480, 300);
      
      // Add subtle grid pattern
      ctx.fillStyle = 'rgba(247, 147, 26, 0.05)';
      for (let i = 0; i < 1280; i += 50) {
        ctx.fillRect(i, 0, 1, 720);
      }
      for (let i = 0; i < 720; i += 50) {
        ctx.fillRect(0, i, 1280, 1);
      }

      // NEW STYLE: Large, bold title with high contrast - PURE WHITE text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Use thumbnail title if available (shorter, more catchy), otherwise use regular title
      let titleToUse = script.thumbnailTitle || script.title;
      
      // Remove quotation marks unless they're actual quotes (e.g., "someone said")
      // Check if quotes are used for actual quotations (words like "said", "announced", "stated" nearby)
      const hasQuoteContext = /\b(said|says|announced|stated|declared|quoted|tweeted|posted|wrote|claimed|revealed)\b/i.test(titleToUse);
      if (!hasQuoteContext) {
        // Remove decorative quotes (not actual quotes)
        titleToUse = titleToUse.replace(/^["']|["']$/g, ''); // Remove leading/trailing quotes
        titleToUse = titleToUse.replace(/\s*["']\s*/g, ' '); // Remove standalone quotes
      }
      
      // Calculate text sizing - adaptive font size to ensure it fits
      const textMaxWidth = 1100; // Full width minus padding
      let fontSize = 90; // Start with large, bold font
      const minFontSize = 60; // Minimum font size
      const maxLines = 2; // Maximum lines allowed
      
      // Try to fit the title with adaptive font sizing
      let titleLines: string[] = [];
      let fits = false;
      
      while (fontSize >= minFontSize && !fits) {
        titleLines = wrapText(ctx, titleToUse, textMaxWidth, fontSize);
        
        // Check if it fits within max lines
        if (titleLines.length <= maxLines) {
          // Double-check each line actually fits
          let allLinesFit = true;
          ctx.font = `bold ${fontSize}px Arial`;
          for (const line of titleLines) {
            const width = ctx.measureText(line).width;
            if (width > textMaxWidth) {
              allLinesFit = false;
              break;
            }
          }
          if (allLinesFit) {
            fits = true;
            break;
          }
        }
        
        // Reduce font size and try again
        fontSize -= 5;
      }
      
      // If still doesn't fit, use the best attempt and truncate if needed
      if (!fits) {
        fontSize = minFontSize;
        titleLines = wrapText(ctx, titleToUse, textMaxWidth, fontSize);
        // Ensure we don't exceed max lines
        if (titleLines.length > maxLines) {
          titleLines = titleLines.slice(0, maxLines);
          // Truncate last line if needed
          ctx.font = `bold ${fontSize}px Arial`;
          const lastLine = titleLines[maxLines - 1];
          let truncated = lastLine;
          while (ctx.measureText(truncated).width > textMaxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
          }
          if (truncated.length < lastLine.length) {
            truncated = truncated.slice(0, -3) + '...';
          }
          titleLines[maxLines - 1] = truncated;
        }
      }
      
      // Position title in center area (spans both dark and orange sides)
      const lineHeight = 110;
      const totalTextHeight = titleLines.length * lineHeight;
      const startY = 360 - (totalTextHeight / 2) + (lineHeight / 2);
      let yPos = startY;
      
      titleLines.forEach((line: string, index: number) => {
        // Set font and alignment (use the calculated fontSize)
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // PROVEN STYLE: Simple white text with minimal black outline
        // This is what successful crypto channels use
        
        // Step 1: Draw ONE subtle shadow (not multiple)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillText(line, 641, yPos + 3);
        
        // Step 2: Draw thin black stroke for definition
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3; // Thin stroke
        ctx.strokeText(line, 640, yPos);
        
        // Step 3: Draw PURE WHITE text (no yellow, no gradients - just white)
        ctx.fillStyle = '#FFFFFF'; // Pure white - this is what works
        ctx.fillText(line, 640, yPos);
        
        yPos += lineHeight;
      });
      
      // PROVEN STYLE: Date/time stamp - simple badge, centered in orange border
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const dateTimeStr = `${dateStr} • ${timeStr}`;
      
      // Measure text first to size badge properly
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'left';
      const textMetrics = ctx.measureText(dateTimeStr);
      const textWidth = textMetrics.width;
      
      // Create badge in lower left - sized to fit text
      const badgePadding = 18;
      const dateBadgeX = 50;
      const dateBadgeY = 625;
      const dateBadgeWidth = textWidth + (badgePadding * 2);
      const dateBadgeHeight = 45;
      
      const drawDateTimeBadge = (x: number, y: number, width: number, height: number, radius: number) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
      };
      
      // Dark background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      drawDateTimeBadge(dateBadgeX, dateBadgeY, dateBadgeWidth, dateBadgeHeight, 8);
      ctx.fill();
      
      // Orange border - CENTERED around the badge
      ctx.strokeStyle = '#F7931A';
      ctx.lineWidth = 2;
      drawDateTimeBadge(dateBadgeX, dateBadgeY, dateBadgeWidth, dateBadgeHeight, 8);
      ctx.stroke();
      
      // White text - PERFECTLY CENTERED both horizontally and vertically
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dateTimeStr, dateBadgeX + (dateBadgeWidth / 2), dateBadgeY + (dateBadgeHeight / 2));

      // PROVEN STYLE: "LATEST" badge - simple and clean
      const drawBadge = (x: number, y: number, width: number, height: number, radius: number) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
      };
      
      // Bitcoin orange badge
      const badgeX = 50;
      const badgeY = 50;
      const badgeWidth = 200;
      const badgeHeight = 65;
      ctx.fillStyle = '#F7931A';
      drawBadge(badgeX, badgeY, badgeWidth, badgeHeight, 10);
      ctx.fill();
      
      // White text - CENTERED in badge
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 34px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LATEST', badgeX + (badgeWidth / 2), badgeY + (badgeHeight / 2));

      // PROVEN STYLE: "Crypto B" branding - simple white text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 60px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      
      // Thin black outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText('₿ Crypto B', 1220, 680);
      
      // White text
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('₿ Crypto B', 1220, 680);

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
      
      // Use thumbnail title if available, otherwise use regular title
      let titleToUse = script.thumbnailTitle || script.title;
      
      // Remove quotation marks unless they're actual quotes (e.g., "someone said")
      const hasQuoteContext = /\b(said|says|announced|stated|declared|quoted|tweeted|posted|wrote|claimed|revealed)\b/i.test(titleToUse);
      if (!hasQuoteContext) {
        // Remove decorative quotes (not actual quotes)
        titleToUse = titleToUse.replace(/^["']|["']$/g, ''); // Remove leading/trailing quotes
        titleToUse = titleToUse.replace(/\s*["']\s*/g, ' '); // Remove standalone quotes
      }
      
      const safeTitle = escapeXml(titleToUse.substring(0, 50));
      
      // NEW STYLE SVG: Split background with white text
      const titleWords = safeTitle.split(' ');
      const line1 = titleWords.slice(0, Math.ceil(titleWords.length / 2)).join(' ');
      const line2 = titleWords.slice(Math.ceil(titleWords.length / 2)).join(' ');
      
      // Get date and time for SVG
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const dateTimeStr = `${dateStr} • ${timeStr}`;
      
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a0a;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
    </linearGradient>
    <radialGradient id="accentGrad" cx="86%" cy="14%">
      <stop offset="0%" style="stop-color:#F7931A;stop-opacity:0.4" />
      <stop offset="100%" style="stop-color:#F7931A;stop-opacity:0" />
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bgGrad)"/>
  <ellipse cx="1100" cy="100" rx="300" ry="300" fill="url(#accentGrad)"/>
  <rect x="50" y="50" width="200" height="65" rx="10" fill="#F7931A"/>
  <text x="150" y="82.5" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">LATEST</text>
  <text x="640" y="320" font-family="Arial, sans-serif" font-size="90" font-weight="bold" fill="#FFFFFF" text-anchor="middle" stroke="#000000" stroke-width="3">
    <tspan x="640" dy="0">${line1}</tspan>
    <tspan x="640" dy="110">${line2 || ''}</tspan>
  </text>
  <rect x="50" y="625" width="260" height="45" rx="8" fill="rgba(0,0,0,0.8)" stroke="#F7931A" stroke-width="2"/>
  <text x="180" y="647.5" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${escapeXml(dateTimeStr)}</text>
  <text x="1220" y="680" font-family="Arial, sans-serif" font-size="60" font-weight="bold" fill="#FFFFFF" text-anchor="end" stroke="#000000" stroke-width="3">₿ Crypto B</text>
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
  maxWidth: number,
  fontSize: number = 72
): string[] {
  // Set font size for accurate measurement
  ctx.font = `bold ${fontSize}px Arial`;
  
  // Remove emojis for measurement (they can cause issues)
  const textWithoutEmojis = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
  const words = textWithoutEmojis.split(' ').filter(w => w.length > 0);
  
  if (words.length === 0) {
    return [text]; // Return original if no words after emoji removal
  }
  
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + ' ' + word;
    const width = ctx.measureText(testLine).width;
    if (width < maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  
  // Allow up to 3 lines if needed, but prefer 2
  if (lines.length > 3) {
    // Try to intelligently split into 3 lines
    const allWords = textWithoutEmojis.split(' ').filter(w => w.length > 0);
    const wordsPerLine = Math.ceil(allWords.length / 3);
    const line1 = allWords.slice(0, wordsPerLine).join(' ');
    const line2 = allWords.slice(wordsPerLine, wordsPerLine * 2).join(' ');
    const line3 = allWords.slice(wordsPerLine * 2).join(' ');
    
    // Check if all lines fit within maxWidth
    ctx.font = `bold ${fontSize}px Arial`;
    const line1Width = ctx.measureText(line1).width;
    const line2Width = ctx.measureText(line2).width;
    const line3Width = ctx.measureText(line3).width;
    
    if (line1Width < maxWidth && line2Width < maxWidth && line3Width < maxWidth) {
      return [line1, line2, line3];
    } else {
      // Fall back to 2 lines
      const midPoint = Math.ceil(allWords.length / 2);
      const line1Two = allWords.slice(0, midPoint).join(' ');
      const line2Two = allWords.slice(midPoint).join(' ');
      
      // Truncate if needed
      let finalLine1 = line1Two;
      let finalLine2 = line2Two;
      
      if (ctx.measureText(finalLine1).width > maxWidth) {
        while (ctx.measureText(finalLine1).width > maxWidth && finalLine1.length > 0) {
          finalLine1 = finalLine1.substring(0, finalLine1.length - 1);
        }
      }
      
      if (ctx.measureText(finalLine2).width > maxWidth) {
        while (ctx.measureText(finalLine2).width > maxWidth && finalLine2.length > 0) {
          finalLine2 = finalLine2.substring(0, finalLine2.length - 1);
        }
        if (line2Two.length > finalLine2.length) {
          finalLine2 += '...';
        }
      }
      
      return [finalLine1, finalLine2];
    }
  }
  
  // Ensure all lines fit within maxWidth
  return lines.map(line => {
    let adjustedLine = line;
    while (ctx.measureText(adjustedLine).width > maxWidth && adjustedLine.length > 0) {
      adjustedLine = adjustedLine.substring(0, adjustedLine.length - 1);
    }
    return adjustedLine + (line.length > adjustedLine.length ? '...' : '');
  });
}

