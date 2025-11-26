import OpenAI from 'openai';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { VideoScript } from './aiService.js';
import { PriceUpdate } from './priceData.js';

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
        
        // STRICT: Ensure we never have more than MAX_LINES active at once
        // If we're at or above max lines, end the oldest active line(s) before starting new one
        while (activeLines.length >= MAX_LINES) {
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
        
        // Final safety check: Never add if we're already at MAX_LINES
        if (activeLines.length >= MAX_LINES) {
          // Force end the oldest line
          activeLines.sort((a, b) => a.start - b.start);
          const oldestLine = activeLines[0];
          const newEndTime = Math.max(oldestLine.start, currentTime - 0.15);
          lineData[oldestLine.lineIndex].end = newEndTime;
          activeLines.shift();
        }
        
        // Store line data
        const lineIndex = lineData.length;
        lineData.push({
          start: lineStartTime,
          end: lineEndTime,
          text: lineText,
          words: lineWords
        });
        
        // Track this line as active (guaranteed to be < MAX_LINES at this point)
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
Style: Default,Arial,52,&Hffffff,&H1A93F7,&H000000,&HC0000000,1,0,0,0,100,100,0,0,1,4,2,2,10,10,75,1

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
  
  // Calculate section timings based on actual audio duration and script structure
  // Use proportional timing based on script sections
  const fullScript = script.script;
  const scriptLines = fullScript.split('\n').filter(line => line.trim().length > 0);
  const scriptWords = fullScript.split(/\s+/).filter(w => w.trim().length > 0);
  
  // Use actual audio duration
  const effectiveDuration = duration;
  
  // Helper function to find section start using proportional script position
  const findSectionStartProportional = (keywords: string[], fallbackRatio: number): number => {
    const lowerScript = fullScript.toLowerCase();
    let bestMatchIndex = -1;
    let bestMatchRatio = 1.0; // Start with end of script
    
    // Find the earliest occurrence of any keyword
    for (const keyword of keywords) {
      const index = lowerScript.indexOf(keyword.toLowerCase());
      if (index !== -1) {
        const ratio = index / fullScript.length;
        if (ratio < bestMatchRatio) {
          bestMatchRatio = ratio;
          bestMatchIndex = index;
        }
      }
    }
    
    if (bestMatchIndex !== -1 && bestMatchRatio < 0.9) {
      // Use proportional position in script to calculate time
      return bestMatchRatio * effectiveDuration;
    }
    
    // Fallback to ratio-based time
    return fallbackRatio * effectiveDuration;
  };
  
  // Calculate section timings using proportional approach
  // Intro: first ~10% of video or 15 seconds, whichever is less
  const introEnd = Math.min(15, effectiveDuration * 0.1);
  
  // Price section: starts after intro, look for price keywords
  // If found, use that position; otherwise use 15s (right after intro)
  const priceKeywords = ['price', 'winners', 'losers', 'market', 'movement', 'pumping', 'mooning', 'top gainers', 'top losers'];
  const priceStartRatio = findSectionStartProportional(priceKeywords, 0.1) / effectiveDuration;
  const priceStart = Math.max(introEnd, Math.min(priceStartRatio * effectiveDuration, effectiveDuration * 0.25));
  const priceEnd = Math.min(priceStart + 30, effectiveDuration * 0.3);
  
  // NFT section: near the end, look for NFT keywords
  // If found, use that position; otherwise use last 30-45 seconds
  const nftKeywords = ['nft', 'collection', 'floor', 'opensea', 'trending', 'bored ape', 'pudgy'];
  const nftStartRatio = findSectionStartProportional(nftKeywords, 0.85) / effectiveDuration;
  // NFT should be in last 30% of video
  const nftStart = nftStartRatio > 0.7 
    ? nftStartRatio * effectiveDuration
    : Math.max(effectiveDuration - 45, effectiveDuration * 0.85);
  const nftEnd = Math.min(nftStart + 30, effectiveDuration - 10);
  
  // Debug logging for section timings
  console.log(`📊 Section timings (Duration: ${effectiveDuration.toFixed(1)}s):`);
  console.log(`   Intro: 0-${introEnd.toFixed(1)}s`);
  console.log(`   Price: ${priceStart.toFixed(1)}-${priceEnd.toFixed(1)}s (${((priceStart/effectiveDuration)*100).toFixed(1)}% of video)`);
  console.log(`   NFT: ${nftStart.toFixed(1)}-${nftEnd.toFixed(1)}s (${((nftStart/effectiveDuration)*100).toFixed(1)}% of video)`);
  
  // Helper function to escape text for FFmpeg drawtext
  // Escape: backslashes, single quotes, colons, square brackets, and percent signs
  // Note: % must be escaped as %% because FFmpeg uses % for variable substitution
  const escapeText = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/'/g, "\\'")    // Escape single quotes
      .replace(/"/g, '\\"')     // Escape double quotes
      .replace(/:/g, '\\:')    // Escape colons (filter separator)
      .replace(/\[/g, '\\[')   // Escape square brackets
      .replace(/\]/g, '\\]')   // Escape square brackets
      .replace(/%/g, '%%');    // Escape percent signs (FFmpeg variable syntax)
  };

  // Build text overlay filters for price data
  // Position titles near top (y=60-80) to avoid overlap with captions at bottom (y~640)
  let priceOverlays: string[] = [];
  if (script.priceUpdate && script.priceUpdate.topWinners.length > 0) {
    // Market sentiment label (top) - White and bold - Shown at the START of price update section (first 6 seconds)
    const priceTitleDuration = 6;
    const priceTitleEnd = Math.min(priceStart + priceTitleDuration, priceEnd);
    const sentimentText = escapeText(`Market: ${script.priceUpdate.marketSentiment.toUpperCase()}`);
    priceOverlays.push(
      `drawtext=text='${sentimentText}':fontsize=42:fontcolor=0xFFFFFF:borderw=3:bordercolor=0x000000:x=(w-text_w)/2:y=60:enable='between(t\\,${priceStart}\\,${priceTitleEnd})'`
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
    // NFT label - White and bold - Shown at the START of NFT section (first 6 seconds)
    const nftTitleDuration = 6;
    const nftTitleEnd = Math.min(nftStart + nftTitleDuration, nftEnd);
    nftOverlays.push(
      `drawtext=text='NFT UPDATE':fontsize=54:fontcolor=0xFFFFFF:borderw=3:bordercolor=0x000000:x=(w-text_w)/2:y=60:enable='between(t\\,${nftStart}\\,${nftTitleEnd})'`
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
  
  // Build topic title overlays for main news section
  // Calculate when each topic appears in the script and show titles
  // Use textfile to avoid FFmpeg parsing issues with special characters (colons, quotes, etc.)
  // Topics are limited to 3 words max and are scheduled to not overlap
  let topicOverlays: string[] = [];
  const topicTextFiles: string[] = []; // Track files to clean up later
  if (script.topics && script.topics.length > 0) {
    const scriptLines = script.script.split('\n').filter(line => line.trim().length > 0);
    const mainNewsStart = priceEnd; // After price update section
    const mainNewsEnd = nftStart; // Before NFT section
    const availableTime = Math.max(0, mainNewsEnd - mainNewsStart);
    const topicFileBaseTimestamp = Date.now(); // Use single timestamp for all topic files
    
    // Duration for each topic title (seconds)
    const topicDuration = 6;
    // Minimum gap between topics (seconds)
    const topicGap = 1;
    
    // Use script words for keyword matching
    const fullScript = script.script;
    const scriptWords = fullScript.split(/\s+/).filter(w => w.trim().length > 0);
    
    // First pass: Calculate ideal positions for all topics based on script location
    interface TopicSchedule {
      topic: typeof script.topics[0];
      truncatedTitle: string;
      idealStart: number;
      index: number;
    }
    
    const topicSchedules: TopicSchedule[] = [];
    
    for (let index = 0; index < script.topics.length; index++) {
      const topic = script.topics[index];
      
      // Truncate topic title to maximum 3 words
      const words = topic.title.split(' ').filter(w => w.trim().length > 0);
      const truncatedTitle = words.slice(0, 3).join(' ');
      
      // Find where this topic appears in the script - look for the START of the topic section
      const topicKeywords = truncatedTitle.split(' ').slice(0, 3).filter(w => w.length > 2);
      let foundWordIndex = -1;
      
      // Search through script words to find when topic starts being discussed
      // Look for the first occurrence where multiple keywords appear together
      for (let i = 0; i < scriptWords.length; i++) {
        // Check a window of words (current word + next 10 words) for topic keywords
        const window = scriptWords.slice(i, Math.min(i + 10, scriptWords.length))
          .join(' ')
          .toLowerCase();
        
        const matchingKeywords = topicKeywords.filter(keyword => 
          window.includes(keyword.toLowerCase())
        );
        
        // Require at least 2 keywords (or all if less than 2) to match for better accuracy
        if (matchingKeywords.length >= Math.min(2, topicKeywords.length)) {
          foundWordIndex = i;
          break;
        }
      }
      
      // If not found with multiple keywords, try with single keyword
      if (foundWordIndex === -1) {
        for (let i = 0; i < scriptWords.length; i++) {
          const word = scriptWords[i].toLowerCase().replace(/[^\w]/g, '');
          if (topicKeywords.some(keyword => word.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(word))) {
            foundWordIndex = i;
            break;
          }
        }
      }
      
      // Calculate ideal start time based on proportional script position
      // Use script position ratio to map to actual video time
      let idealStart: number;
      if (foundWordIndex >= 0) {
        // Calculate position as ratio of total script
        const scriptPositionRatio = foundWordIndex / scriptWords.length;
        
        // Map script position to video time
        // Topics should be in the main news section (between priceEnd and nftStart)
        // But if found position suggests it's in main news, use that
        const topicTimeFromStart = scriptPositionRatio * effectiveDuration;
        
        // If topic time is in main news section range, use it
        if (topicTimeFromStart >= mainNewsStart && topicTimeFromStart < mainNewsEnd) {
          idealStart = topicTimeFromStart;
        } else if (topicTimeFromStart < mainNewsStart) {
          // Topic appears before main news, use start of main news
          idealStart = mainNewsStart;
        } else {
          // Topic appears after main news, distribute proportionally in main news
          const mainNewsRatio = (topicTimeFromStart - mainNewsStart) / (mainNewsEnd - mainNewsStart);
          idealStart = mainNewsStart + (mainNewsRatio * availableTime);
        }
      } else {
        // Topic not found, distribute evenly in main news section
        const scriptPosition = (index + 1) / (script.topics.length + 1);
        idealStart = mainNewsStart + (scriptPosition * availableTime);
      }
      
      // Ensure ideal start is within main news section
      idealStart = Math.max(mainNewsStart, Math.min(idealStart, mainNewsEnd - topicDuration));
      
      topicSchedules.push({
        topic,
        truncatedTitle,
        idealStart,
        index
      });
    }
    
    // Sort by ideal start time to process in chronological order
    topicSchedules.sort((a, b) => a.idealStart - b.idealStart);
    
    // Second pass: Schedule topics to appear at the start of their sections
    // Priority: Show topics at their ideal start time (when they're discussed)
    // Only shift if absolutely necessary to prevent overlap
    const scheduledTopics: Array<{ schedule: TopicSchedule; start: number; end: number }> = [];
    let lastTopicEnd = mainNewsStart;
    
    for (const schedule of topicSchedules) {
      // Start with ideal position (when topic is actually discussed)
      let topicStart = schedule.idealStart;
      
      // Only shift forward if it would overlap with previous topic
      // This ensures topics appear at the start of their sections
      if (topicStart < lastTopicEnd + topicGap) {
        // Only shift if absolutely necessary - prefer showing at ideal time
        // But ensure minimum gap to avoid visual overlap
        topicStart = lastTopicEnd + topicGap;
      }
      
      const topicEnd = Math.min(topicStart + topicDuration, mainNewsEnd);
      
      // Only schedule if it fits within the main news section
      if (topicStart >= mainNewsStart && topicStart < mainNewsEnd && topicEnd > topicStart) {
        scheduledTopics.push({
          schedule,
          start: topicStart,
          end: topicEnd
        });
        lastTopicEnd = topicEnd;
      }
    }
    
    // If we couldn't fit all topics with ideal positions, redistribute remaining ones evenly
    if (scheduledTopics.length < topicSchedules.length && lastTopicEnd < mainNewsEnd) {
      const unscheduled = topicSchedules.filter(
        s => !scheduledTopics.some(st => st.schedule.index === s.index)
      );
      
      if (unscheduled.length > 0) {
        const remainingTime = mainNewsEnd - lastTopicEnd - topicGap;
        const timePerTopic = remainingTime / unscheduled.length;
        
        unscheduled.forEach((schedule, unscheduledIndex) => {
          const topicStart = lastTopicEnd + topicGap + (unscheduledIndex * timePerTopic);
          const topicEnd = Math.min(topicStart + topicDuration, mainNewsEnd);
          
          if (topicStart < mainNewsEnd && topicEnd > topicStart) {
            scheduledTopics.push({
              schedule,
              start: topicStart,
              end: topicEnd
            });
            lastTopicEnd = topicEnd;
          }
        });
      }
    }
    
    // Sort scheduled topics by their original index to maintain order
    scheduledTopics.sort((a, b) => a.schedule.index - b.schedule.index);
    
    // Create overlays for all scheduled topics
    for (const scheduled of scheduledTopics) {
      const { schedule, start: topicStart, end: topicEnd } = scheduled;
      
      // Write truncated topic title to a text file to avoid escaping issues
      const topicTextFile = path.join(outputDir, `topic_${topicFileBaseTimestamp}_${schedule.index}.txt`);
      await fs.writeFile(topicTextFile, schedule.truncatedTitle, 'utf-8');
      topicTextFiles.push(topicTextFile);
      
      // Escape the textfile path for FFmpeg (same pattern as ticker file)
      const escapedTopicFile = topicTextFile.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
      topicOverlays.push(
        `drawtext=textfile='${escapedTopicFile}':fontsize=48:fontcolor=0xFFFFFF:borderw=3:bordercolor=0x000000:x=(w-text_w)/2:y=60:enable='between(t\\,${topicStart}\\,${topicEnd})'`
      );
    }
  }
  
  // Build enhanced scrolling ticker tape at bottom with crypto prices
  // Using drawtext with scrolling for reliability, with color-coded text
  let tickerOverlay: string | null = null;
  let tickerTextFile: string | null = null;
  if (script.priceUpdate && script.priceUpdate.tickerCoins && script.priceUpdate.tickerCoins.length > 0) {
    const tickerCoins = script.priceUpdate.tickerCoins;
    
    // Build ticker items with segmented color coding
    // Only the change value (+2.5 or -2.5) will be colored, rest stays white
    interface TickerSegment {
      text: string;
      color: string; // 'white', 'green', or 'red'
      width: number;
    }
    
    interface TickerItem {
      segments: TickerSegment[];
      totalWidth: number;
      isPositive: boolean;
    }
    
    const tickerItems: TickerItem[] = [];
    
    // Estimate character width (roughly 15 pixels per character for Arial 28px)
    // Increased to account for font rendering, spacing, and prevent overlap
    const charWidth = 15;
    const separator = '  •  ';
    const separatorWidth = charWidth * separator.length; // Approximate width of separator
    
    tickerCoins.forEach((coin, index) => {
      // Sanitize coin symbol to prevent shell command injection
      const sanitizedSymbol = coin.symbol.replace(/[^a-zA-Z0-9_-]/g, '');
      
      // Format price based on value
      let priceFormatted: string;
      if (coin.price >= 1000) {
        priceFormatted = `$${(coin.price / 1000).toFixed(2)}K`;
      } else if (coin.price >= 1) {
        priceFormatted = `$${coin.price.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
      } else {
        priceFormatted = `$${coin.price.toFixed(4)}`;
      }
      
      // Format change (without % sign to avoid FFmpeg parsing issues)
      const changeValue = Math.abs(coin.change24h);
      const isPositive = coin.change24h >= 0;
      const changeFormatted = isPositive 
        ? `+${changeValue.toFixed(1)}`
        : `-${changeValue.toFixed(1)}`;
      
      // Split into segments: Symbol+Price (white), Change (green/red), Space (white)
      // Removed arrow since color coding already indicates direction
      // Add extra space after price for better visual separation before change value
      const symbolPriceText = `${sanitizedSymbol} ${priceFormatted}  `;
      const changeColor = isPositive ? 'green' : 'red';
      // Add space after change value to prevent overlap with next coin (white, not colored)
      const spacingAfterChange = ' ';
      
      const segments: TickerSegment[] = [
        { text: symbolPriceText, color: 'white', width: symbolPriceText.length * charWidth },
        { text: changeFormatted, color: changeColor, width: changeFormatted.length * charWidth },
        { text: spacingAfterChange, color: 'white', width: spacingAfterChange.length * charWidth }
      ];
      
      const totalWidth = segments.reduce((sum, seg) => sum + seg.width, 0);
      
      tickerItems.push({
        segments,
        totalWidth,
        isPositive
      });
    });
    
    // Calculate cumulative widths for positioning
    let cumulativeWidth = 0;
    const itemPositions: number[] = [];
    tickerItems.forEach((item, index) => {
      itemPositions.push(cumulativeWidth);
      cumulativeWidth += item.totalWidth;
      if (index < tickerItems.length - 1) {
        cumulativeWidth += separatorWidth;
      }
    });
    
    // Total width of one complete cycle
    const totalWidth = cumulativeWidth;
    
    // Position and scroll parameters
    const scrollSpeed = 60; // pixels per second
    const baseTickerY = 600; // Base position above captions
    const videoWidth = 1280;
    
    // Create gradient background overlay for ticker area using drawbox
    const tickerHeight = 50;
    const tickerPadding = 8;
    const tickerTopY = baseTickerY - tickerHeight / 2 - tickerPadding;
    const tickerBandHeight = tickerHeight + (tickerPadding * 2);
    
    // Calculate vertically centered y position for text
    // FFmpeg drawtext uses baseline, so we need to account for font size
    const fontSize = 28;
    const tickerCenterY = tickerTopY + tickerBandHeight / 2;
    // Adjust for baseline: center - half font size (baseline is at bottom of text)
    // Most text sits above the baseline, so subtract to center properly
    const tickerY = tickerCenterY - fontSize / 2 + 2; // +2 accounts for border/outline
    // Separator dots positioned 5 pixels lower than main text
    const separatorY = tickerY + 5;
    
    // Create gradient background using multiple drawbox filters with different opacities
    // FFmpeg drawbox uses 8-digit hex format: 0xRRGGBBAA (alpha as last 2 digits)
    const gradientBoxes: string[] = [];
    const gradientSteps = 4;
    for (let i = 0; i < gradientSteps; i++) {
      const opacity = 0.65 + (i * 0.08); // 0.65 to 0.89 opacity gradient
      const boxHeight = (tickerHeight + (tickerPadding * 2)) / gradientSteps;
      const yPos = tickerTopY + (i * boxHeight);
      const alphaDecimal = Math.round(opacity * 255);
      const alphaHex = alphaDecimal.toString(16).padStart(2, '0').toLowerCase();
      gradientBoxes.push(
        `drawbox=x=0:y=${yPos}:w=iw:h=${boxHeight}:color=0x000000${alphaHex}:t=fill`
      );
    }
    
    // Add Bitcoin orange accent at edges
    const accentWidth = 5;
    const accentAlphaHex = (220).toString(16).padStart(2, '0').toLowerCase(); // 0xdc
    const accentBoxes = [
      `drawbox=x=0:y=${tickerTopY}:w=${accentWidth}:h=${tickerHeight + (tickerPadding * 2)}:color=0x1A93F7${accentAlphaHex}:t=fill`, // Left edge
      `drawbox=x=${videoWidth - accentWidth}:y=${tickerTopY}:w=${accentWidth}:h=${tickerHeight + (tickerPadding * 2)}:color=0x1A93F7${accentAlphaHex}:t=fill` // Right edge
    ];
    
    // Combine gradient and accent boxes
    const tickerBackground = [...gradientBoxes, ...accentBoxes].join(',');
    
    // Create color-coded drawtext filters
    // Only the change value will be colored (green/red), rest stays white
    const tickerDrawtexts: string[] = [];
    
    // Base scrolling position (all items scroll together)
    // Start from right edge and scroll left
    const scrollPeriod = totalWidth * 3; // 3 cycles for seamless looping
    const baseScrollX = `w-mod(t*${scrollSpeed}\\,${scrollPeriod})`;
    
    // Helper function to get color hex value
    const getColorHex = (color: string): string => {
      switch (color) {
        case 'green': return '0x00FF00';
        case 'red': return '0xFF0000';
        default: return '0xFFFFFF'; // white
      }
    };
    
    // Helper function to escape text for FFmpeg
    // Important: Escape special characters that could be interpreted as shell commands
    const escapeText = (text: string): string => {
      // Escape backslashes first
      let escaped = text.replace(/\\/g, '\\\\');
      // Escape colons
      escaped = escaped.replace(/:/g, '\\:');
      // Escape single quotes
      escaped = escaped.replace(/'/g, "\\'");
      // Escape dollar signs (could trigger variable expansion)
      escaped = escaped.replace(/\$/g, '\\$');
      // Escape backticks (could trigger command substitution)
      escaped = escaped.replace(/`/g, '\\`');
      // Escape parentheses (could be interpreted as shell commands)
      escaped = escaped.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      // Remove or escape any forward slashes that might be interpreted as paths
      // Actually, forward slashes should be fine in text, but let's be safe
      return escaped;
    };
    
    // Create drawtext filters for each segment of each coin
    // Create 3 cycles for seamless looping
    for (let cycle = 0; cycle < 3; cycle++) {
      const cycleOffset = totalWidth * cycle;
      
      tickerItems.forEach((item, index) => {
        const itemBaseX = itemPositions[index] + cycleOffset;
        let segmentOffset = 0;
        
        // Render each segment with its appropriate color
        item.segments.forEach((segment) => {
          const segmentX = itemBaseX + segmentOffset;
          const colorHex = getColorHex(segment.color);
          const escapedText = escapeText(segment.text);
          
          // Calculate absolute x position: scroll position + offset
          // FFmpeg needs the offset to be part of the expression
          const xExpression = `${baseScrollX}+${segmentX}`;
          
          tickerDrawtexts.push(
            `drawtext=text='${escapedText}':fontsize=28:fontcolor=${colorHex}:borderw=2:bordercolor=0x000000:x=${xExpression}:y=${tickerY}`
          );
          
          segmentOffset += segment.width;
        });
      });
      
      // Add separators (white color) between items within each cycle
      tickerItems.forEach((item, index) => {
        if (index < tickerItems.length - 1) {
          const separatorX = itemPositions[index] + item.totalWidth + cycleOffset;
          const escapedSeparator = escapeText(separator);
          const xExpression = `${baseScrollX}+${separatorX}`;
          
          tickerDrawtexts.push(
            `drawtext=text='${escapedSeparator}':fontsize=28:fontcolor=0xFFFFFF:borderw=2:bordercolor=0x000000:x=${xExpression}:y=${separatorY}`
          );
        }
      });
    }
    
    // Combine background and all ticker text filters
    tickerOverlay = `${tickerBackground},${tickerDrawtexts.join(',')}`;
  }
  
  // Combine all overlays
  const allOverlays: string[] = [...priceOverlays, ...nftOverlays, ...topicOverlays];
  if (tickerOverlay) {
    allOverlays.push(tickerOverlay);
  }
  
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
  
  // Add subtitles filter - styles are already set in the ASS file, no need for force_style
  // This avoids FFmpeg parsing issues with comma-separated force_style values
  filterChain += `,subtitles='${escapedSubtitlePath}',format=yuv420p`;
  
  const ffmpegCommand = `ffmpeg -y -loop 1 -i "${escapedAvatarPath}" -i "${escapedAudioPath}" ` +
    `-vf "${filterChain}" ` +
    `-c:v libx264 -preset slow -crf 18 -tune stillimage -c:a aac -b:a 256k -ar 48000 -pix_fmt yuv420p ` +
    `-shortest "${escapedVideoPath}"`;
  
  try {
    console.log('🎬 Creating video with FFmpeg...');
    console.log(`Filter chain length: ${filterChain.length} characters`);
    if (allOverlays.length > 0) {
      const tickerCount = tickerOverlay ? 1 : 0;
      console.log(`📊 Adding ${allOverlays.length} text overlays (${priceOverlays.length} price, ${nftOverlays.length} NFT, ${topicOverlays.length} topic titles${tickerCount > 0 ? `, ${tickerCount} ticker` : ''})`);
      if (tickerOverlay) {
        console.log(`📈 Ticker tape: ${script.priceUpdate?.tickerCoins?.length || 0} coins scrolling at bottom`);
      }
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
    
    // Log the filter chain for debugging (truncated if too long)
    if (filterChain.length < 500) {
      console.error('Filter chain that failed:', filterChain);
    } else {
      console.error('Filter chain length:', filterChain.length, 'characters');
      console.error('First 200 chars:', filterChain.substring(0, 200));
      console.error('Last 200 chars:', filterChain.substring(filterChain.length - 200));
    }
    
    // Extract actual error message (skip version info)
    const errorLines = errorMessage.split('\n').filter((line: string) => 
      line.toLowerCase().includes('error') || 
      line.toLowerCase().includes('failed') ||
      line.toLowerCase().includes('invalid') ||
      line.toLowerCase().includes('unrecognized')
    );
    const actualError = errorLines.length > 0 ? errorLines[0] : errorMessage.substring(0, 300);
    
    throw new Error(`Failed to create video: ${actualError}. Make sure FFmpeg is installed: https://ffmpeg.org/download.html`);
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
      ctx.fillText('CB', centerX + 3, centerY + 25);
      
      // Outline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.strokeText('CB', centerX, centerY + 22);
      
      // Main text
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 130px Arial';
      ctx.fillText('CB', centerX, centerY + 22);

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
  <text x="640" y="342" font-family="Arial, sans-serif" font-size="130" font-weight="bold" fill="#000000" text-anchor="middle" stroke="#ffffff" stroke-width="2">CB</text>
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

    // Generate AI-powered thumbnail design
    const { generateThumbnailDesign } = await import('./aiService.js');
    let thumbnailDesign;
    try {
      console.log('🎨 Generating AI-powered thumbnail design...');
      thumbnailDesign = await generateThumbnailDesign(script.title, script.topics);
      console.log(`✅ Thumbnail design: ${thumbnailDesign.description}`);
    } catch (error) {
      console.warn('Failed to generate AI design, using defaults:', error);
      thumbnailDesign = {
        backgroundColor: '#0a0a0a',
        accentColor: '#F7931A',
        textColor: '#FFFFFF',
        layout: 'centered',
        visualElements: ['gradient', 'glow', 'grid'],
        emphasis: 'bold',
        description: 'Default high-quality design'
      };
    }

    // Try Canvas first, fallback to Sharp if Canvas fails
    try {
      const { createCanvas } = await import('canvas');
      const canvas = createCanvas(1280, 720);
      const ctx = canvas.getContext('2d');

      // AI-ENHANCED STYLE: Use AI-generated design specifications
      // Create background gradient based on AI design
      const bgColor = thumbnailDesign.backgroundColor;
      const accentColor = thumbnailDesign.accentColor;
      
      // Parse hex color to RGB for gradient
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : { r: 10, g: 10, b: 10 };
      };
      
      const bgRgb = hexToRgb(bgColor);
      const accentRgb = hexToRgb(accentColor);
      
      // Enhanced gradient background
      const bgGradient = ctx.createLinearGradient(0, 0, 1280, 720);
      const darkerBg = `rgb(${Math.max(0, bgRgb.r - 5)}, ${Math.max(0, bgRgb.g - 5)}, ${Math.max(0, bgRgb.b - 5)})`;
      const lighterBg = `rgb(${Math.min(255, bgRgb.r + 20)}, ${Math.min(255, bgRgb.g + 20)}, ${Math.min(255, bgRgb.b + 20)})`;
      bgGradient.addColorStop(0, darkerBg);
      bgGradient.addColorStop(0.5, lighterBg);
      bgGradient.addColorStop(1, darkerBg);
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, 1280, 720);
      
      // Enhanced accent gradient based on AI design
      const accentGradient = ctx.createRadialGradient(1100, 100, 0, 1100, 100, 350);
      accentGradient.addColorStop(0, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.5)`);
      accentGradient.addColorStop(0.5, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.2)`);
      accentGradient.addColorStop(1, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0)`);
      ctx.fillStyle = accentGradient;
      ctx.fillRect(750, 0, 530, 350);
      
      // Add visual elements based on AI suggestions
      if (thumbnailDesign.visualElements.includes('grid')) {
        ctx.fillStyle = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.06)`;
        for (let i = 0; i < 1280; i += 50) {
          ctx.fillRect(i, 0, 1, 720);
        }
        for (let i = 0; i < 720; i += 50) {
          ctx.fillRect(0, i, 1280, 1);
        }
      }
      
      // Add glow effect if suggested
      if (thumbnailDesign.visualElements.includes('glow')) {
        const glowGradient = ctx.createRadialGradient(640, 360, 0, 640, 360, 400);
        glowGradient.addColorStop(0, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.15)`);
        glowGradient.addColorStop(1, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0)`);
        ctx.fillStyle = glowGradient;
        ctx.fillRect(0, 0, 1280, 720);
      }

      // AI-ENHANCED: Large, bold title with high contrast using AI-specified colors
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Use thumbnail title (4 words max, AI-generated)
      let titleToUse = script.thumbnailTitle || script.title;
      
      // Ensure it's 4 words max
      const words = titleToUse.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 4) {
        titleToUse = words.slice(0, 4).join(' ');
      }
      
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
      let fontSize = 180; // Start with large, bold font (doubled from 90)
      const minFontSize = 100; // Minimum font size (reduced to ensure all words fit)
      const maxLines = 3; // Maximum lines allowed (increased to fit all words)
      
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
        fontSize -= 10;
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
      // Calculate line height based on actual font size (1.2x for spacing)
      const lineHeight = fontSize * 1.2;
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
        
        // Step 3: Draw text using AI-specified color for maximum impact
        ctx.fillStyle = thumbnailDesign.textColor; // AI-optimized text color
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
      
      // Accent color border - CENTERED around the badge (using AI-specified accent)
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      drawDateTimeBadge(dateBadgeX, dateBadgeY, dateBadgeWidth, dateBadgeHeight, 8);
      ctx.stroke();
      
      // Text color - PERFECTLY CENTERED (using AI-specified text color)
      ctx.fillStyle = thumbnailDesign.textColor;
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dateTimeStr, dateBadgeX + (dateBadgeWidth / 2), dateBadgeY + (dateBadgeHeight / 2) + 5);

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
      
      // Accent color badge (using AI-specified accent color)
      const badgeX = 50;
      const badgeY = 50;
      const badgeWidth = 200;
      const badgeHeight = 65;
      ctx.fillStyle = accentColor;
      drawBadge(badgeX, badgeY, badgeWidth, badgeHeight, 10);
      ctx.fill();
      
      // Text color - CENTERED in badge (using AI-specified text color)
      ctx.fillStyle = thumbnailDesign.textColor;
      ctx.font = 'bold 34px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LATEST', badgeX + (badgeWidth / 2), badgeY + (badgeHeight / 2) + 13);

      // AI-ENHANCED: "Crypto B" branding - using AI-specified text color
      ctx.font = 'bold 60px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      
      // Thin black outline for contrast
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText('₿ Crypto B', 1220, 680);
      
      // Text using AI-specified color
      ctx.fillStyle = thumbnailDesign.textColor;
      ctx.fillText('₿ Crypto B', 1220, 680);

      // Add Bitcoin orange border around the entire thumbnail
      const borderWidth = 8; // 8px border
      ctx.strokeStyle = '#F7931A'; // Bitcoin orange
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(borderWidth / 2, borderWidth / 2, 1280 - borderWidth, 720 - borderWidth);

      // Save thumbnail
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(thumbnailPath, buffer);

      return thumbnailPath;
    } catch (canvasError) {
      console.warn('Canvas not available, using Sharp fallback:', canvasError);
      // Fallback to Sharp for simple thumbnail with AI design
      const sharp = await import('sharp');
      
      // Get AI design (should already be generated above, but generate if not)
      let design = thumbnailDesign;
      if (!design) {
        try {
          const { generateThumbnailDesign } = await import('./aiService.js');
          design = await generateThumbnailDesign(script.title, script.topics);
        } catch (error) {
          design = {
            backgroundColor: '#0a0a0a',
            accentColor: '#F7931A',
            textColor: '#FFFFFF',
            layout: 'centered',
            visualElements: ['gradient', 'glow', 'grid'],
            emphasis: 'bold',
            description: 'Default design'
          };
        }
      }
      
      // Create a high-quality gradient thumbnail using Sharp with AI design
      // Escape XML entities in title
      const escapeXml = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };
      
      // Use thumbnail title (4 words max, AI-generated)
      let titleToUse = script.thumbnailTitle || script.title;
      
      // Ensure it's 4 words max
      const words = titleToUse.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 4) {
        titleToUse = words.slice(0, 4).join(' ');
      }
      
      // Remove quotation marks unless they're actual quotes
      const hasQuoteContext = /\b(said|says|announced|stated|declared|quoted|tweeted|posted|wrote|claimed|revealed)\b/i.test(titleToUse);
      if (!hasQuoteContext) {
        titleToUse = titleToUse.replace(/^["']|["']$/g, '');
        titleToUse = titleToUse.replace(/\s*["']\s*/g, ' ');
      }
      
      const safeTitle = escapeXml(titleToUse);
      
      // Calculate adaptive font size to ensure all words fit
      // Estimate text width: approximately 0.6 * fontSize per character (for Arial bold)
      const estimateTextWidth = (text: string, fontSize: number): number => {
        // Remove emojis for width estimation (they take less space)
        const textWithoutEmojis = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|₿|🚀|💎|📈|📉|⚡|🔥/gu, '');
        // Arial bold is approximately 0.6 * fontSize per character
        return textWithoutEmojis.length * fontSize * 0.6;
      };
      
      const textMaxWidth = 1100; // Full width minus padding
      let fontSize = 180; // Start with large font
      const minFontSize = 100; // Minimum font size
      const maxLines = 3; // Allow up to 3 lines to fit all words
      
      // Try to fit the title with adaptive font sizing
      let titleLines: string[] = [];
      let fits = false;
      
      while (fontSize >= minFontSize && !fits) {
        // Split title into words (preserving emojis)
        const parts = titleToUse.split(/\s+/).filter(p => p.length > 0);
        titleLines = [];
        let currentLine = parts[0] || '';
        
        // Build lines that fit within maxWidth
        for (let i = 1; i < parts.length; i++) {
          const testLine = currentLine + ' ' + parts[i];
          const width = estimateTextWidth(testLine, fontSize);
          
          if (width < textMaxWidth && titleLines.length < maxLines - 1) {
            currentLine = testLine;
          } else {
            if (currentLine) {
              titleLines.push(currentLine);
            }
            currentLine = parts[i];
          }
        }
        if (currentLine) {
          titleLines.push(currentLine);
        }
        
        // Check if all lines fit and we're within maxLines
        if (titleLines.length <= maxLines) {
          let allLinesFit = true;
          for (const line of titleLines) {
            const width = estimateTextWidth(line, fontSize);
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
        fontSize -= 10;
      }
      
      // If still doesn't fit, use minimum size and ensure all words are included
      if (!fits) {
        fontSize = minFontSize;
        const parts = titleToUse.split(/\s+/).filter(p => p.length > 0);
        titleLines = [];
        let currentLine = parts[0] || '';
        
        for (let i = 1; i < parts.length; i++) {
          const testLine = currentLine + ' ' + parts[i];
          const width = estimateTextWidth(testLine, fontSize);
          
          if (width < textMaxWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) {
              titleLines.push(currentLine);
            }
            currentLine = parts[i];
          }
        }
        if (currentLine) {
          titleLines.push(currentLine);
        }
      }
      
      // Ensure we have at least one line
      if (titleLines.length === 0) {
        titleLines = [titleToUse];
      }
      
      // Escape each line for XML
      const escapedLines = titleLines.map(line => escapeXml(line));
      const line1 = escapedLines[0] || '';
      const line2 = escapedLines[1] || '';
      const line3 = escapedLines[2] || '';
      
      // Calculate line spacing based on font size
      const lineSpacing = fontSize * 1.2; // 1.2x font size for line height
      
      // Calculate vertical position based on number of lines
      const numLines = titleLines.length;
      let textY: number;
      if (numLines === 1) {
        textY = 360;
      } else if (numLines === 2) {
        textY = 320;
      } else {
        textY = 280;
      }
      
      // Get date and time for SVG
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const dateTimeStr = `${dateStr} • ${timeStr}`;
      
      // Convert hex to RGB for SVG
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        } : { r: 10, g: 10, b: 10 };
      };
      
      const bgRgb = hexToRgb(design.backgroundColor);
      const accentRgb = hexToRgb(design.accentColor);
      const textRgb = hexToRgb(design.textColor);
      
      // Create darker and lighter variants for gradient
      const darkerBg = `rgb(${Math.max(0, bgRgb.r - 5)}, ${Math.max(0, bgRgb.g - 5)}, ${Math.max(0, bgRgb.b - 5)})`;
      const lighterBg = `rgb(${Math.min(255, bgRgb.r + 20)}, ${Math.min(255, bgRgb.g + 20)}, ${Math.min(255, bgRgb.b + 20)})`;
      const accentColorRgb = `rgb(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b})`;
      const textColorRgb = `rgb(${textRgb.r}, ${textRgb.g}, ${textRgb.b})`;
      
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${darkerBg};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${lighterBg};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${darkerBg};stop-opacity:1" />
    </linearGradient>
    <radialGradient id="accentGrad" cx="86%" cy="14%">
      <stop offset="0%" style="stop-color:${accentColorRgb};stop-opacity:0.5" />
      <stop offset="50%" style="stop-color:${accentColorRgb};stop-opacity:0.2" />
      <stop offset="100%" style="stop-color:${accentColorRgb};stop-opacity:0" />
    </radialGradient>
    ${design.visualElements.includes('glow') ? `
    <radialGradient id="glowGrad" cx="50%" cy="50%">
      <stop offset="0%" style="stop-color:${accentColorRgb};stop-opacity:0.15" />
      <stop offset="100%" style="stop-color:${accentColorRgb};stop-opacity:0" />
    </radialGradient>
    ` : ''}
  </defs>
  <rect width="1280" height="720" fill="url(#bgGrad)" stroke="#F7931A" stroke-width="8"/>
  <ellipse cx="1100" cy="100" rx="350" ry="350" fill="url(#accentGrad)"/>
  ${design.visualElements.includes('glow') ? `<ellipse cx="640" cy="360" rx="400" ry="400" fill="url(#glowGrad)"/>` : ''}
  ${design.visualElements.includes('grid') ? `
  <g opacity="0.06">
    ${Array.from({length: 26}, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="720" stroke="${accentColorRgb}" stroke-width="1"/>`).join('')}
    ${Array.from({length: 15}, (_, i) => `<line x1="0" y1="${i * 50}" x2="1280" y2="${i * 50}" stroke="${accentColorRgb}" stroke-width="1"/>`).join('')}
  </g>
  ` : ''}
  <rect x="50" y="50" width="200" height="65" rx="10" fill="${accentColorRgb}"/>
  <text x="150" y="95.5" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="${textColorRgb}" text-anchor="middle" dominant-baseline="middle">LATEST</text>
  <text x="640" y="${textY}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${textColorRgb}" text-anchor="middle" stroke="#000000" stroke-width="3">
    <tspan x="640" dy="0">${line1}</tspan>
    ${line2 ? `<tspan x="640" dy="${lineSpacing}">${line2}</tspan>` : ''}
    ${line3 ? `<tspan x="640" dy="${lineSpacing}">${line3}</tspan>` : ''}
  </text>
  <rect x="50" y="625" width="260" height="45" rx="8" fill="rgba(0,0,0,0.8)" stroke="${accentColorRgb}" stroke-width="2"/>
  <text x="180" y="652.5" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="${textColorRgb}" text-anchor="middle" dominant-baseline="middle">${escapeXml(dateTimeStr)}</text>
  <text x="1220" y="680" font-family="Arial, sans-serif" font-size="60" font-weight="bold" fill="${textColorRgb}" text-anchor="end" stroke="#000000" stroke-width="3">₿ Crypto B</text>
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
  
  // Split by spaces to preserve emojis (they're part of words)
  const parts = text.split(/\s+/).filter(p => p.length > 0);
  
  if (parts.length === 0) {
    return [text]; // Return original if empty
  }
  
  const lines: string[] = [];
  let currentLine = parts[0];
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const testLine = currentLine + ' ' + part;
    // Measure with emojis included (Canvas handles them)
    const width = ctx.measureText(testLine).width;
    if (width < maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = part;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  
  // If we have more than 3 lines, try to redistribute
  if (lines.length > 3) {
    // Try to intelligently split into 3 lines
    const wordsPerLine = Math.ceil(parts.length / 3);
    const line1 = parts.slice(0, wordsPerLine).join(' ');
    const line2 = parts.slice(wordsPerLine, wordsPerLine * 2).join(' ');
    const line3 = parts.slice(wordsPerLine * 2).join(' ');
    
    // Check if all lines fit within maxWidth
    ctx.font = `bold ${fontSize}px Arial`;
    const line1Width = ctx.measureText(line1).width;
    const line2Width = ctx.measureText(line2).width;
    const line3Width = ctx.measureText(line3).width;
    
    if (line1Width < maxWidth && line2Width < maxWidth && line3Width < maxWidth) {
      return [line1, line2, line3];
    }
  }
  
  // Ensure all lines fit within maxWidth (but don't truncate - let adaptive sizing handle it)
  return lines;
}

