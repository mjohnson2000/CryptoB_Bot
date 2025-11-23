import { scrapeCryptoNews } from './newsScraper.js';
import { distillTrendingTopics, generateVideoScript, TrendingTopic } from './aiService.js';
import { generateVideoWithAvatar, generateThumbnail } from './videoGenerator.js';
import { updateDescriptionWithTimestamps } from './timestampUpdater.js';
import { uploadToYouTube } from './youtubeUploader.js';
import { VideoScript } from './aiService.js';
import { topicHistory } from './topicHistory.js';
import path from 'path';

export interface VideoCreationResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  script?: VideoScript;
  videoPath?: string;
  thumbnailPath?: string;
  readyForApproval?: boolean;
  error?: string;
}

export interface JobProgress {
  jobId: string;
  status: 'pending' | 'scraping' | 'analyzing' | 'generating_script' | 'creating_video' | 'updating_timestamps' | 'creating_thumbnail' | 'ready' | 'uploading' | 'completed' | 'error';
  progress: number; // 0-100
  message: string;
  result?: VideoCreationResult;
}

// Store job progress in memory (in production, use Redis or database)
export const jobStore = new Map<string, JobProgress>();

function updateProgress(jobId: string, status: JobProgress['status'], progress: number, message: string) {
  const jobProgress: JobProgress = {
    jobId,
    status,
    progress,
    message,
    result: jobStore.get(jobId)?.result
  };
  jobStore.set(jobId, jobProgress);
  console.log(`[${jobId}] [${status}] (${progress}%) ${message}`);
}

export async function createVideo(jobId: string): Promise<VideoCreationResult> {
  updateProgress(jobId, 'pending', 0, 'Starting video creation...');

  try {
    // Step 1: Scrape latest crypto news
    updateProgress(jobId, 'scraping', 10, 'Scraping latest crypto news...');
    const articles = await scrapeCryptoNews();
    updateProgress(jobId, 'scraping', 20, `Found ${articles.length} articles`);

    // Step 2: Distill top trending topics
    updateProgress(jobId, 'analyzing', 30, 'Analyzing and distilling trending topics...');
    const allTopics = await distillTrendingTopics(articles);
    
    // Step 2.5: Filter out recently covered topics (unless significant update)
    updateProgress(jobId, 'analyzing', 35, 'Filtering recently covered topics...');
    const filteredTopics = filterRecentTopics(allTopics);
    updateProgress(jobId, 'analyzing', 40, `Identified ${filteredTopics.length} trending topics (filtered ${allTopics.length - filteredTopics.length} recently covered)`);

    // Step 3: Generate video script
    updateProgress(jobId, 'generating_script', 50, 'Generating video script...');
    const script = await generateVideoScript(filteredTopics, allTopics);
    updateProgress(jobId, 'generating_script', 60, `Script generated: "${script.title}"`);

    // Step 4: Generate video with avatar
    updateProgress(jobId, 'creating_video', 70, 'Creating video with avatar...');
    const videoPath = await generateVideoWithAvatar(script);
    const videoFileName = path.basename(videoPath);
    updateProgress(jobId, 'creating_video', 80, 'Video created successfully');
    
    // Step 4.5: Update description with accurate timestamps
    updateProgress(jobId, 'updating_timestamps', 82, 'Calculating accurate timestamps...');
    const updatedScript = await updateDescriptionWithTimestamps(script, videoPath);
    script.description = updatedScript.description;
    updateProgress(jobId, 'updating_timestamps', 85, 'Timestamps updated');

    // Step 5: Generate thumbnail
    updateProgress(jobId, 'creating_thumbnail', 90, 'Generating thumbnail...');
    const thumbnailPath = await generateThumbnail(script);
    const thumbnailFileName = path.basename(thumbnailPath);
    updateProgress(jobId, 'creating_thumbnail', 95, 'Thumbnail generated');

    // Store result for approval
    const result: VideoCreationResult = {
      success: true,
      script,
      videoPath,
      thumbnailPath,
      readyForApproval: true
    };

    updateProgress(jobId, 'ready', 100, 'Video ready for preview and approval');
    
    // Store topics in history for future filtering
    topicHistory.addTopics(filteredTopics, jobId);
    
    const finalProgress = jobStore.get(jobId);
    if (finalProgress) {
      finalProgress.result = result;
      jobStore.set(jobId, finalProgress);
    }

    return result;
  } catch (error) {
    console.error(`[${jobId}] Error in video creation:`, error);
    const errorResult: VideoCreationResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    updateProgress(jobId, 'error', 0, `Error: ${errorResult.error}`);
    const errorProgress = jobStore.get(jobId);
    if (errorProgress) {
      errorProgress.result = errorResult;
      jobStore.set(jobId, errorProgress);
    }
    return errorResult;
  }
}

export async function approveAndUpload(jobId: string): Promise<VideoCreationResult> {
  const jobData = jobStore.get(jobId);
  if (!jobData || !jobData.result) {
    throw new Error('Job not found');
  }

  if (!jobData.result.readyForApproval) {
    throw new Error('Video not ready for approval');
  }

  if (!jobData.result.videoPath || !jobData.result.thumbnailPath || !jobData.result.script) {
    throw new Error('Missing video, thumbnail, or script data');
  }

  try {
    updateProgress(jobId, 'uploading', 0, 'Uploading to YouTube...');
    const uploadResult = await uploadToYouTube(
      jobData.result.videoPath,
      jobData.result.thumbnailPath,
      jobData.result.script
    );
    updateProgress(jobId, 'completed', 100, `Upload successful: ${uploadResult.url}`);

    const result: VideoCreationResult = {
      success: true,
      videoId: uploadResult.videoId,
      videoUrl: uploadResult.url,
      script: jobData.result.script,
      videoPath: jobData.result.videoPath,
      thumbnailPath: jobData.result.thumbnailPath
    };

    const finalProgress = jobStore.get(jobId);
    if (finalProgress) {
      finalProgress.result = result;
      finalProgress.status = 'completed';
      jobStore.set(jobId, finalProgress);
    }

    return result;
  } catch (error) {
    console.error(`[${jobId}] Error uploading to YouTube:`, error);
    updateProgress(jobId, 'error', 0, `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

export function getJobProgress(jobId: string): JobProgress | undefined {
  return jobStore.get(jobId);
}

/**
 * Filter out recently covered topics unless they have significant updates
 */
function filterRecentTopics(topics: TrendingTopic[]): TrendingTopic[] {
  const filtered: TrendingTopic[] = [];
  const recentTopics = topicHistory.getRecentTopics(8); // Last 8 hours (2 videos)
  
  topics.forEach(topic => {
    const wasRecentlyCovered = topicHistory.wasRecentlyCovered(topic.title, 8);
    
    if (!wasRecentlyCovered) {
      // New topic - always include
      filtered.push(topic);
      console.log(`✅ Including new topic: "${topic.title}"`);
    } else {
      // Recently covered - check for significant updates
      const recentEntry = topicHistory.getRecentEntry(topic.title);
      const hasSignificantUpdate = checkForSignificantUpdate(topic, recentEntry);
      
      if (hasSignificantUpdate) {
        // Has significant update - include but mark for different angle
        topic.isUpdate = true;
        filtered.push(topic);
        console.log(`🔄 Including updated topic: "${topic.title}" (has significant update)`);
      } else {
        // No significant update - skip
        console.log(`⏭️ Skipping recently covered topic: "${topic.title}" (no significant update)`);
      }
    }
  });
  
  // Ensure we have at least 2 topics (fallback: include top topics even if recently covered)
  if (filtered.length < 2 && topics.length > 0) {
    const topTopics = topics.slice(0, 2);
    topTopics.forEach(topic => {
      if (!filtered.find(t => t.title === topic.title)) {
        topic.isUpdate = true; // Mark as update to vary narrative
        filtered.push(topic);
        console.log(`⚠️ Including topic due to low count: "${topic.title}"`);
      }
    });
  }
  
  return filtered.slice(0, 4); // Max 4 topics
}

/**
 * Check if a topic has significant updates compared to recent coverage
 */
function checkForSignificantUpdate(
  currentTopic: TrendingTopic,
  recentEntry: { topicTitle: string; topicSummary: string; timestamp: Date } | null
): boolean {
  if (!recentEntry) {
    return false; // No recent entry to compare
  }
  
  // Check for significant changes in summary (new developments mentioned)
  const currentSummary = currentTopic.summary.toLowerCase();
  const recentSummary = recentEntry.topicSummary.toLowerCase();
  
  // Extract key terms/phrases that indicate updates
  const updateIndicators = [
    'new', 'update', 'latest', 'breaking', 'announce', 'launch', 'release',
    'surge', 'drop', 'crash', 'rally', 'spike', 'plunge',
    'milestone', 'record', 'all-time', 'high', 'low',
    'partnership', 'deal', 'acquisition', 'merger',
    'regulation', 'approval', 'rejection', 'ban'
  ];
  
  // Check if current summary has new update indicators not in recent
  const hasNewUpdates = updateIndicators.some(indicator => {
    const inCurrent = currentSummary.includes(indicator);
    const inRecent = recentSummary.includes(indicator);
    return inCurrent && !inRecent;
  });
  
  // Check for significant text differences (new information)
  const summarySimilarity = calculateSimilarity(currentSummary, recentSummary);
  const hasNewInfo = summarySimilarity < 0.7; // Less than 70% similar = new info
  
  // Check importance score (higher importance might indicate significant development)
  const importanceIncrease = currentTopic.importance >= 8; // High importance topics
  
  const hasUpdate = hasNewUpdates || hasNewInfo || importanceIncrease;
  
  if (hasUpdate) {
    console.log(`   📊 Update detected: newUpdates=${hasNewUpdates}, newInfo=${hasNewInfo}, highImportance=${importanceIncrease}`);
  }
  
  return hasUpdate;
}

/**
 * Calculate similarity between two strings (simple Jaccard similarity)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 3));
  
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.length / union.size : 0;
}
