import { createVideo, approveAndUpload, VideoCreationResult } from './videoOrchestrator.js';
import { getCurrentESTTime, getCurrentESTISOString, addHoursEST, utcISOToESTDate } from '../utils/timeUtils.js';

export interface AutomationState {
  isRunning: boolean;
  cadenceHours: number;
  lastRun?: string; // ISO date string
  nextRun?: string; // ISO date string
  intervalId?: NodeJS.Timeout;
  currentJobId?: string;
}

interface InternalState {
  isRunning: boolean;
  cadenceHours: number;
  lastRun?: Date;
  nextRun?: Date;
  intervalId?: NodeJS.Timeout;
  firstRunTimeout?: NodeJS.Timeout;
  currentJobId?: string;
}

class AutomationService {
  private state: InternalState = {
    isRunning: false,
    cadenceHours: 6
  };

  /**
   * Start the automation scheduler
   * @param cadenceHours - Interval between runs in hours
   * @param startTime - Optional time for first run (ISO string or Date). If not provided, runs immediately.
   */
  start(cadenceHours: number = 6, startTime?: string | Date): void {
    if (this.state.isRunning) {
      console.log('⚠️ Automation is already running');
      return;
    }

    this.state.cadenceHours = cadenceHours;
    this.state.isRunning = true;
    
    const intervalMs = cadenceHours * 60 * 60 * 1000; // Convert hours to milliseconds
    
    // If no startTime provided, run immediately
    if (!startTime) {
      console.log(`🚀 Starting automation: Creating videos every ${cadenceHours} hours`);
      console.log(`⏰ Running first video immediately...`);
      
      // Run immediately
      this.runAutomatedVideoCreation();
      // Then schedule recurring runs
      this.state.intervalId = setInterval(() => {
        this.runAutomatedVideoCreation();
      }, intervalMs);
      // Calculate next run time from now
      this.updateNextRunTime();
      return;
    }
    
    // Calculate when to run the first video (startTime was provided)
    // Convert startTime to EST Date object if it's a string (UTC ISO from frontend)
    let firstRunTime: Date;
    if (typeof startTime === 'string') {
      // Frontend sends UTC ISO string representing EST time, convert it properly
      firstRunTime = utcISOToESTDate(startTime);
    } else {
      firstRunTime = startTime;
    }
    const now = getCurrentESTTime();
    if (firstRunTime <= now) {
      console.warn('⚠️ Start time is in the past, running immediately');
      firstRunTime = now;
    }

    const msUntilFirstRun = firstRunTime.getTime() - Date.now();
    
    console.log(`🚀 Starting automation: Creating videos every ${cadenceHours} hours`);
    if (msUntilFirstRun > 0) {
      console.log(`⏰ First run scheduled for: ${firstRunTime.toLocaleString()}`);
    }
    
    // Schedule first run
    if (msUntilFirstRun > 0) {
      // Set nextRun to the first scheduled run time
      this.state.nextRun = firstRunTime;
      
      this.state.firstRunTimeout = setTimeout(() => {
        this.runAutomatedVideoCreation();
        // After first run, schedule recurring runs
        this.state.intervalId = setInterval(() => {
          this.runAutomatedVideoCreation();
        }, intervalMs);
        this.updateNextRunTime();
      }, msUntilFirstRun);
    } else {
      // Start time was in the past or is now, run immediately
      console.log(`⏰ Running first video immediately (start time was in the past or is now)...`);
      this.runAutomatedVideoCreation();
      // Then schedule recurring runs
      this.state.intervalId = setInterval(() => {
        this.runAutomatedVideoCreation();
      }, intervalMs);
      // Calculate next run time from now
      this.updateNextRunTime();
    }
  }

  /**
   * Stop the automation scheduler
   */
  stop(): void {
    if (!this.state.isRunning) {
      console.log('⚠️ Automation is not running');
      return;
    }

    if (this.state.intervalId) {
      clearInterval(this.state.intervalId);
      this.state.intervalId = undefined;
    }

    if (this.state.firstRunTimeout) {
      clearTimeout(this.state.firstRunTimeout);
      this.state.firstRunTimeout = undefined;
    }

    this.state.isRunning = false;
    this.state.nextRun = undefined;
    console.log('🛑 Automation stopped');
  }

  /**
   * Get current automation state
   */
  getState(): AutomationState {
    try {
      let nextRun: string | undefined;
      if (this.state.isRunning) {
        // If nextRun is already set (from startTime), use it directly
        if (this.state.nextRun) {
          nextRun = this.state.nextRun.toISOString();
        } else {
          // Otherwise, calculate from lastRun or now
          try {
            nextRun = this.calculateNextRunTime().toISOString();
          } catch (error) {
            console.error('Error calculating next run time:', error);
            // Fallback: calculate from lastRun or now in EST
            if (this.state.lastRun) {
              nextRun = addHoursEST(this.state.lastRun, this.state.cadenceHours).toISOString();
            } else {
              nextRun = addHoursEST(getCurrentESTTime(), this.state.cadenceHours).toISOString();
            }
          }
        }
      }
      
      const state: AutomationState = {
        isRunning: this.state.isRunning,
        cadenceHours: this.state.cadenceHours,
        lastRun: this.state.lastRun?.toISOString(),
        nextRun,
        currentJobId: this.state.currentJobId
      };
      return state;
    } catch (error) {
      console.error('Error in getState():', error);
      // Return safe default state
      return {
        isRunning: false,
        cadenceHours: 6,
        lastRun: undefined,
        nextRun: undefined,
        currentJobId: undefined
      };
    }
  }

  /**
   * Set the cadence (interval in hours)
   */
  setCadence(hours: number): void {
    if (hours < 1) {
      throw new Error('Cadence must be at least 1 hour');
    }
    
    const wasRunning = this.state.isRunning;
    const oldCadence = this.state.cadenceHours;
    
    this.state.cadenceHours = hours;
    
    // If running, restart with new cadence
    if (wasRunning) {
      this.stop();
      this.start(hours);
      console.log(`🔄 Cadence updated from ${oldCadence} hours to ${hours} hours`);
    }
  }

  /**
   * Run automated video creation and upload
   * Wrapped in try-catch to prevent crashes
   */
  private async runAutomatedVideoCreation(): Promise<void> {
    const jobId = Date.now().toString();
    this.state.currentJobId = jobId;
    this.state.lastRun = getCurrentESTTime();
    
    console.log(`\n🤖 [AUTOMATION] Starting automated video creation (Job ID: ${jobId})`);
    console.log(`   Scheduled run at ${this.state.lastRun.toISOString()} (EST)`);
    
    try {
      // Create video (this will handle all the steps)
      const result: VideoCreationResult = await createVideo(jobId).catch((error) => {
        // Catch any errors from createVideo
        console.error(`❌ [AUTOMATION] Error in createVideo:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error in createVideo'
        } as VideoCreationResult;
      });
      
      if (result.success && result.readyForApproval) {
        console.log(`✅ [AUTOMATION] Video created successfully, auto-uploading...`);
        
        try {
          // Auto-approve and upload (skip manual approval for automation)
          const uploadResult: VideoCreationResult = await approveAndUpload(jobId).catch((error) => {
            // Catch any errors from approveAndUpload
            console.error(`❌ [AUTOMATION] Error in approveAndUpload:`, error);
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error in approveAndUpload'
            } as VideoCreationResult;
          });
          
          if (uploadResult.success && uploadResult.videoUrl) {
            console.log(`🎉 [AUTOMATION] Video uploaded successfully!`);
            console.log(`   Video URL: ${uploadResult.videoUrl}`);
          } else {
            console.error(`❌ [AUTOMATION] Upload failed: ${uploadResult.error || 'Unknown error'}`);
            // Don't throw - automation continues
          }
        } catch (uploadError) {
          // Extra safety net for upload errors
          console.error(`❌ [AUTOMATION] Unexpected error during upload:`, uploadError);
          // Don't throw - automation continues
        }
      } else {
        console.error(`❌ [AUTOMATION] Video creation failed: ${result.error || 'Unknown error'}`);
        // Don't throw - automation continues for next scheduled run
      }
    } catch (error) {
      // Final safety net - catch any unexpected errors
      console.error(`❌ [AUTOMATION] Unexpected error in automated video creation:`, error);
      console.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        console.error(`   Stack trace:`, error.stack);
      }
      // Don't throw - automation continues for next scheduled run
    } finally {
      // Always clean up and schedule next run
      this.state.currentJobId = undefined;
      this.updateNextRunTime();
      console.log(`✅ [AUTOMATION] Automation cycle complete. Next run scheduled.`);
    }
  }

  /**
   * Calculate next run time based on cadence
   */
  private calculateNextRunTime(firstRunTime?: Date): Date {
    if (!this.state.isRunning) {
      return getCurrentESTTime();
    }
    
    if (firstRunTime) {
      // If first run is scheduled, calculate from that time in EST
      return addHoursEST(firstRunTime, this.state.cadenceHours);
    }
    
    if (this.state.lastRun) {
      return addHoursEST(this.state.lastRun, this.state.cadenceHours);
    }
    
    return addHoursEST(getCurrentESTTime(), this.state.cadenceHours);
  }

  /**
   * Update next run time
   */
  private updateNextRunTime(firstRunTime?: Date): void {
    if (this.state.isRunning) {
      this.state.nextRun = this.calculateNextRunTime(firstRunTime);
    }
  }
}

// Export singleton instance
export const automationService = new AutomationService();

