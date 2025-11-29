import express from 'express';
import { createDeepDiveVideo, approveAndUploadDeepDive, getDeepDiveJobProgress } from '../../services/deepDiveOrchestrator.js';
import { getMostRequestedTopic, getRecentVideoComments } from '../../services/youtubeComments.js';
import { deepDiveAutomationService } from '../../services/deepDiveAutomationService.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

/**
 * GET /api/deepdive/topics - Get most requested topics from comments
 */
router.get('/topics', async (req, res) => {
  try {
    const topic = await getMostRequestedTopic();
    res.json({ success: true, topic });
  } catch (error) {
    console.error('Error fetching most requested topic:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/deepdive/comments - Get recent comments from videos
 */
router.get('/comments', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const comments = await getRecentVideoComments(limit);
    res.json({ success: true, comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/deepdive/create - Create a deep dive video
 */
router.post('/create', async (req, res) => {
  try {
    const jobId = uuidv4();
    const topic = req.body.topic as string | undefined;

    // Start video creation (non-blocking)
    createDeepDiveVideo(jobId, topic)
      .catch(error => {
        console.error(`[${jobId}] Error in deep dive video creation:`, error);
      });

    res.json({ 
      success: true, 
      jobId,
      message: 'Deep dive video creation started'
    });
  } catch (error) {
    console.error('Error starting deep dive video creation:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/deepdive/progress/:jobId - Get progress of deep dive video creation
 */
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const progress = getDeepDiveJobProgress(jobId);

  if (!progress) {
    return res.status(404).json({ 
      success: false, 
      error: 'Job not found' 
    });
  }

  res.json({ success: true, progress });
});

/**
 * POST /api/deepdive/approve/:jobId - Approve and upload deep dive video
 */
router.post('/approve/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const result = await approveAndUploadDeepDive(jobId);
    
    if (!result.success) {
      return res.status(500).json({ 
        success: false, 
        error: result.error || 'Upload failed' 
      });
    }

    res.json({ 
      success: true, 
      result: {
        videoId: result.videoId,
        videoUrl: result.videoUrl
      }
    });
  } catch (error) {
    console.error('Error approving deep dive video:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/deepdive/automation/status - Get deep dive automation status
 */
router.get('/automation/status', (req, res) => {
  try {
    const state = deepDiveAutomationService.getState();
    res.json({
      success: true,
      ...state
    });
  } catch (error) {
    console.error('Error getting deep dive automation status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/deepdive/automation/start - Start deep dive automation
 */
router.post('/automation/start', (req, res) => {
  try {
    const { cadenceHours, startTime } = req.body;
    const hours = cadenceHours ? Number(cadenceHours) : 24;
    
    if (isNaN(hours) || hours < 1) {
      return res.status(400).json({
        success: false,
        error: 'cadenceHours must be a number >= 1'
      });
    }
    
    // Validate startTime if provided
    let startTimeDate: Date | undefined;
    if (startTime) {
      startTimeDate = new Date(startTime);
      if (isNaN(startTimeDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'startTime must be a valid date/time'
        });
      }
    }
    
    deepDiveAutomationService.start(hours, startTimeDate);
    const state = deepDiveAutomationService.getState();
    
    res.json({
      success: true,
      message: startTimeDate 
        ? `Deep dive automation started with ${hours} hour cadence. First run scheduled for ${startTimeDate.toLocaleString()}`
        : `Deep dive automation started with ${hours} hour cadence`,
      ...state
    });
  } catch (error) {
    console.error('Error starting deep dive automation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/deepdive/automation/stop - Stop deep dive automation
 */
router.post('/automation/stop', (req, res) => {
  try {
    deepDiveAutomationService.stop();
    const state = deepDiveAutomationService.getState();
    
    res.json({
      success: true,
      message: 'Deep dive automation stopped',
      ...state
    });
  } catch (error) {
    console.error('Error stopping deep dive automation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/deepdive/automation/cadence - Set deep dive automation cadence
 */
router.post('/automation/cadence', (req, res) => {
  try {
    const { hours } = req.body;
    
    if (!hours || isNaN(Number(hours)) || Number(hours) < 1) {
      return res.status(400).json({
        success: false,
        error: 'hours must be a number >= 1'
      });
    }
    
    deepDiveAutomationService.setCadence(Number(hours));
    const state = deepDiveAutomationService.getState();
    
    res.json({
      success: true,
      message: `Deep dive automation cadence updated to ${hours} hours`,
      ...state
    });
  } catch (error) {
    console.error('Error setting deep dive automation cadence:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

