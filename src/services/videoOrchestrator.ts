import { scrapeCryptoNews } from './newsScraper.js';
import { distillTrendingTopics, generateVideoScript } from './aiService.js';
import { generateVideoWithAvatar, generateThumbnail } from './videoGenerator.js';
import { uploadToYouTube } from './youtubeUploader.js';
import { VideoScript } from './aiService.js';
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
  status: 'pending' | 'scraping' | 'analyzing' | 'generating_script' | 'creating_video' | 'creating_thumbnail' | 'ready' | 'uploading' | 'completed' | 'error';
  progress: number; // 0-100
  message: string;
  result?: VideoCreationResult;
}

// Store job progress in memory (in production, use Redis or database)
const jobStore = new Map<string, JobProgress>();

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
    const topics = await distillTrendingTopics(articles);
    updateProgress(jobId, 'analyzing', 40, `Identified ${topics.length} trending topics`);

    // Step 3: Generate video script
    updateProgress(jobId, 'generating_script', 50, 'Generating video script...');
    const script = await generateVideoScript(topics);
    updateProgress(jobId, 'generating_script', 60, `Script generated: "${script.title}"`);

    // Step 4: Generate video with avatar
    updateProgress(jobId, 'creating_video', 70, 'Creating video with avatar...');
    const videoPath = await generateVideoWithAvatar(script);
    const videoFileName = path.basename(videoPath);
    updateProgress(jobId, 'creating_video', 80, 'Video created successfully');

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
