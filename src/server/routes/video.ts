import { Router } from 'express';
import { createVideo, approveAndUpload, getJobProgress } from '../../services/videoOrchestrator.js';
import path from 'path';
import express from 'express';

export const videoRouter = Router();

videoRouter.post('/create', async (req, res) => {
  try {
    const jobId = Date.now().toString();
    
    // Start video creation process asynchronously
    createVideo(jobId).catch(error => {
      console.error('Video creation error:', error);
      // Update job progress with error
      const progress = getJobProgress(jobId);
      if (progress) {
        progress.status = 'error';
        progress.progress = 0;
        progress.message = error instanceof Error ? error.message : 'Unknown error occurred';
        progress.result = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    res.json({ 
      success: true, 
      jobId,
      message: 'Video creation started. Check status endpoint for progress.' 
    });
  } catch (error) {
    console.error('Error starting video creation:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

videoRouter.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({ 
        status: 'error',
        message: 'Job ID is required' 
      });
    }
    
    const progress = getJobProgress(jobId);
    
    if (!progress) {
      return res.status(404).json({ 
        jobId,
        status: 'not_found',
        progress: 0,
        message: 'Job not found. It may still be initializing.' 
      });
    }

    res.json(progress);
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ 
      status: 'error',
      progress: 0,
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

videoRouter.post('/approve/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const result = await approveAndUpload(jobId);
    
    res.json(result);
  } catch (error) {
    console.error('Error approving and uploading:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Serve video files for preview
videoRouter.get('/preview/video/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    // Sanitize filename to prevent path traversal
    const safeFilename = path.basename(filename);
    const videoPath = path.join(process.cwd(), 'output', safeFilename);
    
    res.sendFile(videoPath, (err) => {
      if (err) {
        console.error('Error serving video:', err);
        if (!res.headersSent) {
          res.status(404).json({ error: 'Video not found' });
        }
      }
    });
  } catch (error) {
    console.error('Error in video preview endpoint:', error);
    res.status(500).json({ error: 'Error serving video' });
  }
});

// Serve thumbnail files for preview
videoRouter.get('/preview/thumbnail/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    // Sanitize filename to prevent path traversal
    const safeFilename = path.basename(filename);
    const thumbnailPath = path.join(process.cwd(), 'output', safeFilename);
    
    res.sendFile(thumbnailPath, (err) => {
      if (err) {
        console.error('Error serving thumbnail:', err);
        if (!res.headersSent) {
          res.status(404).json({ error: 'Thumbnail not found' });
        }
      }
    });
  } catch (error) {
    console.error('Error in thumbnail preview endpoint:', error);
    res.status(500).json({ error: 'Error serving thumbnail' });
  }
});
