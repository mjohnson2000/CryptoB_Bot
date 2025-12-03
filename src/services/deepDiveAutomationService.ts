import { createDeepDiveVideo, approveAndUploadDeepDive, DeepDiveResult } from './deepDiveOrchestrator.js';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentESTTime, addHoursEST } from '../utils/timeUtils.js';

export interface DeepDiveAutomationState {
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

class DeepDiveAutomationService {
  private state: InternalState = {
    isRunning: false,
    cadenceHours: 24 // Default: once per day
  };

  /**
   * Start the deep dive automation scheduler
   * @param cadenceHours - Interval between runs in hours
   * @param startTime - Optional time for first run (ISO string or Date). If not provided, runs immediately.
   */
  start(cadenceHours: number = 24, startTime?: string | Date): void {
    if (this.state.isRunning) {
      console.log('⚠️ Deep dive automation is already running');
      return;
    }

    this.state.cadenceHours = cadenceHours;
    this.state.isRunning = true;
    
    const intervalMs = cadenceHours * 60 * 60 * 1000; // Convert hours to milliseconds
    
    // If no startTime provided, run immediately
    if (!startTime) {
      console.log(`🚀 Starting deep dive automation: Creating videos every ${cadenceHours} hours`);
      console.log(`⏰ Running first video immediately...`);
      
      // Run immediately
      this.runAutomatedDeepDiveCreation().catch((error) => {
        console.error('❌ Unhandled error in runAutomatedDeepDiveCreation:', error);
      });
      // Then schedule recurring runs
      this.state.intervalId = setInterval(() => {
        this.runAutomatedDeepDiveCreation().catch((error) => {
          console.error('❌ Unhandled error in runAutomatedDeepDiveCreation:', error);
        });
      }, intervalMs);
      // Calculate next run time from now
      this.updateNextRunTime();
      return;
    }
    
    // Calculate when to run the first video (startTime was provided)
    let firstRunTime: Date = typeof startTime === 'string' ? new Date(startTime) : startTime;
    const now = getCurrentESTTime();
    if (firstRunTime <= now) {
      console.warn('⚠️ Start time is in the past, running immediately');
      firstRunTime = now;
    }

    const msUntilFirstRun = firstRunTime.getTime() - Date.now();
    
    console.log(`🚀 Starting deep dive automation: Creating videos every ${cadenceHours} hours`);
    if (msUntilFirstRun > 0) {
      console.log(`⏰ First run scheduled for: ${firstRunTime.toLocaleString()}`);
    }
    
    // Schedule first run
    if (msUntilFirstRun > 0) {
      // Set nextRun to the first scheduled run time
      this.state.nextRun = firstRunTime;
      
      this.state.firstRunTimeout = setTimeout(() => {
        this.runAutomatedDeepDiveCreation().catch((error) => {
          console.error('❌ Unhandled error in runAutomatedDeepDiveCreation:', error);
        });
        // After first run, schedule recurring runs
        this.state.intervalId = setInterval(() => {
          this.runAutomatedDeepDiveCreation().catch((error) => {
            console.error('❌ Unhandled error in runAutomatedDeepDiveCreation:', error);
          });
        }, intervalMs);
        this.updateNextRunTime();
      }, msUntilFirstRun);
    } else {
      // Start time was in the past or is now, run immediately
      console.log(`⏰ Running first video immediately (start time was in the past or is now)...`);
      this.runAutomatedDeepDiveCreation().catch((error) => {
        console.error('❌ Unhandled error in runAutomatedDeepDiveCreation:', error);
      });
      // Then schedule recurring runs
      this.state.intervalId = setInterval(() => {
        this.runAutomatedDeepDiveCreation().catch((error) => {
          console.error('❌ Unhandled error in runAutomatedDeepDiveCreation:', error);
        });
      }, intervalMs);
      // Calculate next run time from now
      this.updateNextRunTime();
    }
  }

  /**
   * Stop the deep dive automation scheduler
   */
  stop(): void {
    if (!this.state.isRunning) {
      console.log('⚠️ Deep dive automation is not running');
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
    console.log('🛑 Deep dive automation stopped');
  }

  /**
   * Get current deep dive automation state
   */
  getState(): DeepDiveAutomationState {
    let nextRun: string | undefined;
    if (this.state.isRunning) {
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
    
    const state: DeepDiveAutomationState = {
      isRunning: this.state.isRunning,
      cadenceHours: this.state.cadenceHours,
      lastRun: this.state.lastRun?.toISOString(),
      nextRun,
      currentJobId: this.state.currentJobId
    };
    return state;
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
    
    if (wasRunning) {
      // Restart with new cadence
      this.stop();
      this.start(hours);
      console.log(`🔄 Deep dive automation cadence updated from ${oldCadence}h to ${hours}h`);
    }
  }

  /**
   * Run automated deep dive video creation
   */
  private async runAutomatedDeepDiveCreation(): Promise<void> {
    const jobId = uuidv4();
    this.state.currentJobId = jobId;
    this.state.lastRun = getCurrentESTTime();
    this.updateNextRunTime();

    console.log(`\n🎬 [${jobId}] Starting automated deep dive video creation...`);
    console.log(`📅 Scheduled run at ${this.state.lastRun.toISOString()} (EST)`);

    try {
      // Create deep dive video (will automatically select most requested topic from comments, or trending topic from news if no comments)
      const result: DeepDiveResult = await createDeepDiveVideo(jobId);
      
      if (!result.success) {
        console.error(`❌ [${jobId}] Deep dive video creation failed:`, result.error);
        console.error(`❌ [${jobId}] Full error details:`, JSON.stringify(result, null, 2));
        return;
      }

      if (result.readyForApproval) {
        console.log(`✅ [${jobId}] Deep dive video ready for approval`);
        console.log(`📹 Topic: ${result.topic || 'Unknown'}`);
        
        // Automatically approve and upload
        console.log(`🚀 [${jobId}] Auto-approving and uploading to YouTube...`);
        
        try {
          const uploadResult = await approveAndUploadDeepDive(jobId);
          
          if (uploadResult.success && uploadResult.videoUrl) {
            console.log(`🎉 [${jobId}] Deep dive video uploaded successfully!`);
            console.log(`🔗 URL: ${uploadResult.videoUrl}`);
          } else {
            console.error(`❌ [${jobId}] Upload failed:`, uploadResult.error);
          }
        } catch (uploadError) {
          console.error(`❌ [${jobId}] Error during upload:`, uploadError);
        }
      } else {
        console.error(`❌ [${jobId}] Video not ready for approval`);
      }
    } catch (error) {
      console.error(`❌ [${jobId}] Error in automated deep dive video creation:`, error);
      if (error instanceof Error) {
        console.error(`❌ [${jobId}] Error stack:`, error.stack);
      }
      // Don't throw - allow automation to continue
    } finally {
      // Update next run time after completion (or failure)
      this.updateNextRunTime();
      
      // Clear current job ID after a delay to allow status checks
      setTimeout(() => {
        if (this.state.currentJobId === jobId) {
          this.state.currentJobId = undefined;
        }
      }, 60000); // Clear after 1 minute
    }
  }

  /**
   * Calculate next run time
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
export const deepDiveAutomationService = new DeepDiveAutomationService();

