import { generateDeepDiveScript, VideoScript } from './aiService.js';
import { generateDeepDiveVideo, generateDeepDiveThumbnail } from './videoGenerator.js';
import { uploadToYouTube } from './youtubeUploader.js';
import { getMostRequestedTopic, TopicRequest } from './youtubeComments.js';
import { updateDeepDiveDescriptionWithTimestamps } from './timestampUpdater.js';
import { deepDiveTopicHistory } from './deepDiveTopicHistory.js';
import path from 'path';

export interface DeepDiveResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  script?: VideoScript;
  videoPath?: string;
  thumbnailPath?: string;
  readyForApproval?: boolean;
  topic?: string;
  error?: string;
}

export interface DeepDiveJobProgress {
  jobId: string;
  status: 'pending' | 'fetching_comments' | 'analyzing_topics' | 'generating_script' | 'creating_video' | 'creating_thumbnail' | 'ready' | 'uploading' | 'completed' | 'error';
  progress: number; // 0-100
  message: string;
  result?: DeepDiveResult;
}

// Store deep dive job progress
export const deepDiveJobStore = new Map<string, DeepDiveJobProgress>();

function updateProgress(jobId: string, status: DeepDiveJobProgress['status'], progress: number, message: string) {
  const jobProgress: DeepDiveJobProgress = {
    jobId,
    status,
    progress,
    message,
    result: deepDiveJobStore.get(jobId)?.result
  };
  deepDiveJobStore.set(jobId, jobProgress);
  console.log(`[${jobId}] [${status}] (${progress}%) ${message}`);
}

/**
 * Create a deep dive video on the most requested topic from comments
 */
export async function createDeepDiveVideo(jobId: string, topic?: string): Promise<DeepDiveResult> {
  updateProgress(jobId, 'pending', 0, 'Starting deep dive video creation...');

  try {
    let selectedTopic: TopicRequest | null = null;
    let topicName = topic;

    // Step 1: Get most requested topic from comments (if not provided)
    if (!topicName) {
      updateProgress(jobId, 'fetching_comments', 10, 'Fetching comments from recent videos...');
      selectedTopic = await getMostRequestedTopic();
      
      if (!selectedTopic) {
        updateProgress(jobId, 'error', 0, 'No topic found. Unable to fetch comments or trending topics. Please specify a topic manually.');
        return {
          success: false,
          error: 'No topic found from comments or news'
        };
      }

      topicName = selectedTopic.topic;
      
      // Double-check that this topic hasn't been covered (safety check)
      if (deepDiveTopicHistory.wasTopicCovered(topicName)) {
        updateProgress(jobId, 'error', 0, `Topic "${topicName}" has already been covered in a previous deep dive video.`);
        return {
          success: false,
          error: `Topic "${topicName}" has already been covered`
        };
      }
      
      // Check if this came from comments or news fallback
      if (selectedTopic.count > 0) {
        updateProgress(jobId, 'analyzing_topics', 20, `Most requested topic: "${topicName}" (${selectedTopic.count} requests from comments)`);
      } else {
        updateProgress(jobId, 'analyzing_topics', 20, `Selected trending topic: "${topicName}" (from latest crypto news - no comments found)`);
      }
    } else {
      // If topic is manually provided, check if it was already covered
      if (deepDiveTopicHistory.wasTopicCovered(topicName)) {
        updateProgress(jobId, 'error', 0, `Topic "${topicName}" has already been covered in a previous deep dive video.`);
        return {
          success: false,
          error: `Topic "${topicName}" has already been covered`
        };
      }
      updateProgress(jobId, 'analyzing_topics', 20, `Creating deep dive on: "${topicName}"`);
    }

    // Step 2: Generate deep dive script (5 minutes)
    updateProgress(jobId, 'generating_script', 30, 'Generating deep dive script...');
    if (!topicName) {
      throw new Error('Topic name is required');
    }
    const script = await generateDeepDiveScript(topicName, selectedTopic?.comments || []);
    updateProgress(jobId, 'generating_script', 50, `Script generated: "${script.title}"`);

    // Step 3: Generate video (5 minutes)
    updateProgress(jobId, 'creating_video', 60, 'Creating deep dive video...');
    const videoPath = await generateDeepDiveVideo(script, jobId);
    updateProgress(jobId, 'creating_video', 80, 'Video created successfully');

    // Step 3.5: Update description with accurate timestamps
    updateProgress(jobId, 'creating_video', 82, 'Calculating accurate timestamps...');
    const updatedScript = await updateDeepDiveDescriptionWithTimestamps(script, videoPath);
    script.description = updatedScript.description;
    updateProgress(jobId, 'creating_video', 85, 'Timestamps updated');

    // Step 4: Generate thumbnail
    updateProgress(jobId, 'creating_thumbnail', 85, 'Generating deep dive thumbnail...');
    let thumbnailPath: string;
    try {
      thumbnailPath = await generateDeepDiveThumbnail(script, jobId);
      console.log(`✅ Deep dive thumbnail created: ${thumbnailPath}`);
      updateProgress(jobId, 'creating_thumbnail', 90, `Thumbnail generated: ${thumbnailPath}`);
      
      // Verify thumbnail exists
      const fs = await import('fs/promises');
      try {
        await fs.access(thumbnailPath);
        console.log(`✅ Thumbnail file verified: ${thumbnailPath}`);
      } catch (error) {
        console.error(`❌ Thumbnail file not found at: ${thumbnailPath}`);
        throw new Error(`Thumbnail file was not created at ${thumbnailPath}`);
      }
    } catch (error) {
      console.error('❌ Error generating thumbnail:', error);
      updateProgress(jobId, 'creating_thumbnail', 90, `Thumbnail generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }

    // Step 5: Prepare result
    const result: DeepDiveResult = {
      success: true,
      script,
      videoPath,
      thumbnailPath,
      readyForApproval: true,
      topic: topicName
    };

    updateProgress(jobId, 'ready', 100, 'Deep dive video ready for preview and approval');
    
    // Store result
    const currentProgress = deepDiveJobStore.get(jobId);
    if (currentProgress) {
      currentProgress.result = result;
      deepDiveJobStore.set(jobId, currentProgress);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateProgress(jobId, 'error', 0, `Error: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Approve and upload deep dive video
 */
export async function approveAndUploadDeepDive(jobId: string): Promise<DeepDiveResult> {
  const progress = deepDiveJobStore.get(jobId);
  
  if (!progress || !progress.result) {
    throw new Error('Job not found or not ready for upload');
  }

  const result = progress.result;

  if (!result.videoPath || !result.script) {
    throw new Error('Video or script not found');
  }

  updateProgress(jobId, 'uploading', 0, 'Uploading to YouTube...');

  try {
    if (!result.videoPath || !result.thumbnailPath || !result.script) {
      throw new Error('Video, thumbnail, or script is missing');
    }
    const uploadResult = await uploadToYouTube(
      result.videoPath,
      result.thumbnailPath,
      result.script
    );

    const finalResult: DeepDiveResult = {
      ...result,
      videoId: uploadResult.videoId,
      videoUrl: uploadResult.url,
      readyForApproval: false
    };

    updateProgress(jobId, 'completed', 100, `Upload successful: ${uploadResult.url}`);

    // Record this topic in deep dive history to prevent duplicates
    if (result.topic) {
      await deepDiveTopicHistory.addTopic(
        result.topic,
        jobId,
        uploadResult.videoId,
        uploadResult.url
      );
      console.log(`✅ Recorded deep dive topic "${result.topic}" in history`);
    }

    // Update stored result
    const currentProgress = deepDiveJobStore.get(jobId);
    if (currentProgress) {
      currentProgress.result = finalResult;
      deepDiveJobStore.set(jobId, currentProgress);
    }

    return finalResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateProgress(jobId, 'error', 0, `Upload failed: ${errorMessage}`);
    return {
      ...result,
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Get deep dive job progress
 */
export function getDeepDiveJobProgress(jobId: string): DeepDiveJobProgress | undefined {
  return deepDiveJobStore.get(jobId);
}

