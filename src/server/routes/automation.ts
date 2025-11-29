import { Router } from 'express';
import { automationService } from '../../services/automationService.js';

export const automationRouter = Router();

// Get automation status
automationRouter.get('/status', (req, res) => {
  try {
    const state = automationService.getState();
    res.json({
      success: true,
      ...state
    });
  } catch (error) {
    console.error('Error getting automation status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start automation
automationRouter.post('/start', (req, res) => {
  try {
    const { cadenceHours, startTime } = req.body;
    const hours = cadenceHours ? Number(cadenceHours) : 6;
    
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
    
    automationService.start(hours, startTimeDate);
    const state = automationService.getState();
    
    res.json({
      success: true,
      message: startTimeDate 
        ? `Automation started with ${hours} hour cadence. First run scheduled for ${startTimeDate.toLocaleString()}`
        : `Automation started with ${hours} hour cadence`,
      ...state
    });
  } catch (error) {
    console.error('Error starting automation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Stop automation
automationRouter.post('/stop', (req, res) => {
  try {
    automationService.stop();
    const state = automationService.getState();
    
    res.json({
      success: true,
      message: 'Automation stopped',
      ...state
    });
  } catch (error) {
    console.error('Error stopping automation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Set cadence (interval in hours)
automationRouter.post('/cadence', (req, res) => {
  try {
    const { hours } = req.body;
    
    if (!hours || isNaN(Number(hours)) || Number(hours) < 1) {
      return res.status(400).json({
        success: false,
        error: 'hours must be a number >= 1'
      });
    }
    
    automationService.setCadence(Number(hours));
    const state = automationService.getState();
    
    res.json({
      success: true,
      message: `Cadence updated to ${hours} hours`,
      ...state
    });
  } catch (error) {
    console.error('Error setting cadence:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

