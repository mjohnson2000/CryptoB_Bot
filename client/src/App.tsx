import { useState, useEffect } from 'react';
import axios from 'axios';
import DeepDive from './DeepDive';
import Blog from './Blog';
import './App.css';

// EST timezone helpers (America/New_York handles EST/EDT automatically)
const EST_TIMEZONE = 'America/New_York';

// Convert EST datetime-local string to UTC ISO string
// The input is treated as EST time, regardless of browser timezone
// datetime-local format: "YYYY-MM-DDTHH:mm" (assumed to be in EST)
function estToUTC(estDateTime: string): string {
  const [datePart, timePart] = estDateTime.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  // Create a UTC date using the input components (treating them as UTC for now)
  const tempUTC = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  
  // Get what this UTC time displays as in EST
  const estDisplay = tempUTC.toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse the EST display
  const [estDatePart, estTimePart] = estDisplay.split(', ');
  const [estMonth, estDay, estYear] = estDatePart.split('/').map(Number);
  const [estHours, estMinutes] = estTimePart.split(':').map(Number);
  
  // Calculate difference: what we want vs what tempUTC shows in EST
  // Create date objects in the same timezone for comparison
  const wantedEST = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const actualEST = new Date(Date.UTC(estYear, estMonth - 1, estDay, estHours, estMinutes, 0));
  const diffMs = wantedEST.getTime() - actualEST.getTime();
  
  // Adjust UTC by the difference to get the correct UTC time
  const finalUTC = new Date(tempUTC.getTime() + diffMs);
  return finalUTC.toISOString();
}

// Get EST offset in milliseconds for a given date (handles DST automatically)
function getESTOffsetMs(date: Date): number {
  // Get the same moment in both EST and UTC, then calculate the difference
  const estTimeString = date.toLocaleString('en-US', { 
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const estDate = new Date(estTimeString);
  const utcDate = new Date(utcString);
  return estDate.getTime() - utcDate.getTime();
}

// Format date for display in EST
function formatEST(dateISO: string): string {
  return new Date(dateISO).toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

// Get current time in EST format for datetime-local min attribute
function getCurrentEST(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  const hour = parts.find(p => p.type === 'hour')!.value;
  const minute = parts.find(p => p.type === 'minute')!.value;
  
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

interface JobProgress {
  jobId: string;
  status: 'pending' | 'scraping' | 'analyzing' | 'fetching_prices' | 'fetching_nfts' | 'generating_script' | 'creating_video' | 'updating_timestamps' | 'creating_thumbnail' | 'ready' | 'uploading' | 'generating_blog' | 'posting_blog' | 'completed' | 'error';
  progress: number;
  message: string;
  result?: {
    success: boolean;
    videoId?: string;
    videoUrl?: string;
    script?: {
      title: string;
      description: string;
      tags: string[];
    };
    videoPath?: string;
    thumbnailPath?: string;
    readyForApproval?: boolean;
    blogUrl?: string;
    blogId?: string;
    error?: string;
  };
}

interface AutomationState {
  isRunning: boolean;
  cadenceHours: number;
  lastRun?: string;
  nextRun?: string;
  currentJobId?: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'news' | 'deepdive' | 'blog'>('news');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [automationState, setAutomationState] = useState<AutomationState | null>(null);
  const [cadenceInput, setCadenceInput] = useState<string>('6');
  const [startTimeInput, setStartTimeInput] = useState<string>('');
  const [automationLoading, setAutomationLoading] = useState(false);

  const handleCreateVideo = async () => {
    setLoading(true);
    setError(null);
    
    // Initialize progress immediately so UI shows something right away
    const initialProgress: JobProgress = {
      jobId: '',
      status: 'pending',
      progress: 0,
      message: 'Initializing video creation...'
    };
    setProgress(initialProgress);

    try {
      const response = await axios.post<{ success: boolean; jobId: string; message: string }>('/api/video/create');
      
      if (response.data.jobId) {
        // Update progress with actual jobId
        setProgress(prev => prev ? { ...prev, jobId: response.data.jobId } : initialProgress);
        pollStatus(response.data.jobId);
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
      setLoading(false);
      setProgress(null);
    }
  };

  const pollStatus = async (jobId: string) => {
    const maxAttempts = 120; // 10 minutes max
    let attempts = 0;
    let consecutive404s = 0;
    let interval: NodeJS.Timeout | null = null;

    // Poll immediately first time
    const poll = async () => {
      attempts++;
      
      try {
        const response = await axios.get<JobProgress>(`/api/video/status/${jobId}`);
        consecutive404s = 0; // Reset counter on success
        setProgress(response.data);
        setLoading(response.data.status !== 'ready' && response.data.status !== 'completed' && response.data.status !== 'error');

        if (response.data.status === 'error') {
          if (interval) clearInterval(interval);
          setLoading(false);
          if (response.data.result?.error) {
            setError(response.data.result.error);
          } else if (response.data.message) {
            setError(response.data.message);
          }
        } else if (response.data.status === 'completed' || response.data.status === 'ready') {
          if (interval) clearInterval(interval);
          setLoading(false);
        } else if (attempts >= maxAttempts) {
          if (interval) clearInterval(interval);
          setLoading(false);
          setError('Video creation is taking longer than expected. Check server logs.');
        }
      } catch (err) {
        if (err && axios.isAxiosError(err) && err.response?.status === 404) {
          consecutive404s++;
          // Job not found yet, keep polling but show a message
          if (consecutive404s <= 15) {
            // Update progress to show we're waiting
            setProgress(prev => prev ? {
              ...prev,
              message: 'Waiting for job to initialize...',
              progress: 0
            } : {
              jobId,
              status: 'pending',
              progress: 0,
              message: 'Initializing video creation...'
            });
            return; // Continue polling
          } else {
            // Too many 404s, something is wrong
            if (interval) clearInterval(interval);
            setLoading(false);
            setError('Job not found. The server may have restarted. Please try creating a new video.');
            setProgress(null);
          }
        } else {
          console.error('Error polling status:', err);
          const errorMessage = axios.isAxiosError(err)
            ? err.response?.data?.message || err.message
            : 'Error checking status';
          
          if (attempts >= maxAttempts) {
            if (interval) clearInterval(interval);
            setLoading(false);
            setError(errorMessage);
          }
        }
      }
    };

    // Poll immediately
    await poll();
    
    // Then poll every 2 seconds
    interval = setInterval(poll, 2000);
  };

  const handleApproveAndUpload = async (jobId: string) => {
    setUploading(true);
    setError(null);

    try {
      const response = await axios.post(`/api/video/approve/${jobId}`);
      
      if (response.data.success) {
        // Update progress with upload result
        setProgress(prev => prev ? {
          ...prev,
          status: 'completed',
          progress: 100,
          message: `Upload successful! Video is live on YouTube.`,
          result: response.data
        } : null);
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const getStatusIcon = (status: JobProgress['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'scraping': return '🔍';
      case 'analyzing': return '🤖';
      case 'fetching_prices': return '📊';
      case 'fetching_nfts': return '🖼️';
      case 'generating_script': return '✍️';
      case 'creating_video': return '🎬';
      case 'updating_timestamps': return '⏱️';
      case 'creating_thumbnail': return '🖼️';
      case 'ready': return '✅';
      case 'uploading': return '📤';
      case 'generating_blog': return '✍️';
      case 'posting_blog': return '📝';
      case 'completed': return '🎉';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  const getVideoPreviewUrl = (videoPath?: string) => {
    if (!videoPath) return null;
    const filename = videoPath.split('/').pop() || videoPath.split('\\').pop();
    return `/api/video/preview/video/${filename}`;
  };

  const getThumbnailPreviewUrl = (thumbnailPath?: string) => {
    if (!thumbnailPath) return null;
    const filename = thumbnailPath.split('/').pop() || thumbnailPath.split('\\').pop();
    return `/api/video/preview/thumbnail/${filename}`;
  };

  // Fetch automation status from server
  // NOTE: Automation runs on the server and persists across page refreshes.
  // This function only fetches and displays the current state - it does NOT control automation.
  // Automation can only be stopped by clicking the Stop button (which calls the API).
  const fetchAutomationStatus = async () => {
    try {
      const response = await axios.get<{ success: boolean; isRunning: boolean; cadenceHours: number; lastRun?: string; nextRun?: string; currentJobId?: string }>('/api/automation/status');
      if (response.data.success) {
        setAutomationState({
          isRunning: response.data.isRunning,
          cadenceHours: response.data.cadenceHours,
          lastRun: response.data.lastRun,
          nextRun: response.data.nextRun,
          currentJobId: response.data.currentJobId
        });
        // Always update input to match server, but convert old 4-hour default to new 6-hour default
        // This ensures UI always shows correct value, and migrates old 4-hour cadence to 6 hours
        if (response.data.cadenceHours === 4) {
          // Server has old 4-hour cadence, update to 6 hours (new default)
          setCadenceInput('6');
        } else {
          // Use server value (should be 6 or user-set value)
          setCadenceInput(response.data.cadenceHours.toString());
        }
      }
    } catch (err) {
      // Don't update state on error - keep showing last known state
      // This ensures automation appears to continue running even if there's a temporary network issue
      console.error('Error fetching automation status:', err);
    }
  };

  // Start automation
  const handleStartAutomation = async () => {
    const hours = Number(cadenceInput);
    if (isNaN(hours) || hours < 1) {
      setError('Cadence must be a number >= 1');
      return;
    }

    setAutomationLoading(true);
    setError(null);
    try {
      const payload: { cadenceHours: number; startTime?: string } = { cadenceHours: hours };
      if (startTimeInput) {
        // Convert EST datetime-local to UTC ISO string
        const startTime = estToUTC(startTimeInput);
        payload.startTime = startTime;
      }
      const response = await axios.post('/api/automation/start', payload);
      if (response.data.success) {
        await fetchAutomationStatus();
        setStartTimeInput(''); // Clear after successful start
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setAutomationLoading(false);
    }
  };

  // Stop automation
  const handleStopAutomation = async () => {
    setAutomationLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/automation/stop');
      if (response.data.success) {
        await fetchAutomationStatus();
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setAutomationLoading(false);
    }
  };

  // Set cadence
  const handleSetCadence = async () => {
    const hours = Number(cadenceInput);
    if (isNaN(hours) || hours < 1) {
      setError('Cadence must be a number >= 1');
      return;
    }

    setAutomationLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/automation/cadence', { hours });
      if (response.data.success) {
        await fetchAutomationStatus();
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setAutomationLoading(false);
    }
  };

  // Fetch automation status on mount and periodically
  useEffect(() => {
    fetchAutomationStatus();
    const interval = setInterval(fetchAutomationStatus, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1 className="title">
            <span className="crypto-icon">₿</span>
            Crypto B
          </h1>
          <p className="subtitle">Automated YouTube Crypto News Bot</p>
        </header>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'news' ? 'active' : ''}`}
            onClick={() => setActiveTab('news')}
          >
            📰 News Updates
          </button>
          <button
            className={`tab ${activeTab === 'deepdive' ? 'active' : ''}`}
            onClick={() => setActiveTab('deepdive')}
          >
            🎯 Deep Dive Videos
          </button>
          <button
            className={`tab ${activeTab === 'blog' ? 'active' : ''}`}
            onClick={() => setActiveTab('blog')}
          >
            📝 Blog Posts
          </button>
        </div>

        {activeTab === 'deepdive' ? (
          <DeepDive />
        ) : activeTab === 'blog' ? (
          <Blog />
        ) : (
        <main className="main">
          {/* Automation Section */}
          <div className="card">
            <div className="card-header">
              <h2>🤖 Automated Video Creation</h2>
              <p className="card-description">
                Set up automatic video creation and upload. Videos will be created and uploaded automatically at the specified interval.
              </p>
            </div>

            <div className="automation-controls">
              <div className="automation-status">
                <div className="status-indicator">
                  <span className={`status-dot ${automationState?.isRunning ? 'running' : 'stopped'}`}></span>
                  <span className="status-text">
                    {automationState?.isRunning ? '🟢 Running' : '🔴 Stopped'}
                  </span>
                </div>
                {automationState?.isRunning && (
                  <div className="automation-info">
                    <p><strong>Cadence:</strong> Every {automationState.cadenceHours} hour{automationState.cadenceHours !== 1 ? 's' : ''}</p>
                    {automationState.lastRun && (
                      <p><strong>Last Run:</strong> {formatEST(automationState.lastRun)} EST</p>
                    )}
                    {automationState.nextRun && (
                      <p><strong>Next Run:</strong> {formatEST(automationState.nextRun)} EST</p>
                    )}
                  </div>
                )}
              </div>

              <div className="cadence-control">
                <label htmlFor="cadence-input">Cadence (hours):</label>
                <div className="cadence-input-group">
                  <input
                    id="cadence-input"
                    type="number"
                    min="1"
                    value={cadenceInput}
                    onChange={(e) => setCadenceInput(e.target.value)}
                    disabled={automationLoading}
                    className="cadence-input"
                  />
                  {automationState?.isRunning && (
                    <button
                      onClick={handleSetCadence}
                      disabled={automationLoading}
                      className="update-cadence-button"
                    >
                      Update
                    </button>
                  )}
                </div>
              </div>

              {!automationState?.isRunning && (
                <div className="start-time-control">
                  <label htmlFor="start-time-input">First Upload Time (optional):</label>
                  <input
                    id="start-time-input"
                    type="datetime-local"
                    value={startTimeInput}
                    onChange={(e) => setStartTimeInput(e.target.value)}
                    disabled={automationLoading}
                    className="start-time-input"
                    min={getCurrentEST()}
                  />
                  <p className="help-text">Leave empty to start immediately</p>
                </div>
              )}

              <div className="automation-buttons">
                {!automationState?.isRunning ? (
                  <button
                    onClick={handleStartAutomation}
                    disabled={automationLoading}
                    className="start-automation-button"
                  >
                    {automationLoading ? (
                      <>
                        <span className="spinner"></span>
                        Starting...
                      </>
                    ) : (
                      <>
                        <span>▶️</span>
                        Start Automation
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleStopAutomation}
                    disabled={automationLoading}
                    className="stop-automation-button"
                  >
                    {automationLoading ? (
                      <>
                        <span className="spinner"></span>
                        Stopping...
                      </>
                    ) : (
                      <>
                        <span>⏹️</span>
                        Stop Automation
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Manual Video Creation Section */}
          <div className="card">
            <div className="card-header">
              <h2>Create New Video</h2>
              <p className="card-description">
                Generate a YouTube video with the latest crypto news from the last 6 hours.
                Preview and approve before uploading to YouTube.
              </p>
            </div>

            <button
              className="create-button"
              onClick={handleCreateVideo}
              disabled={loading || uploading}
            >
              {loading || uploading ? (
                <>
                  <span className="spinner"></span>
                  {uploading ? 'Uploading...' : 'Creating Video...'}
                </>
              ) : (
                <>
                  <span>🎬</span>
                  Create Video
                </>
              )}
            </button>

            {progress && (
              <div className="progress-section">
                <div className="progress-header">
                  <span className="progress-icon">{getStatusIcon(progress.status)}</span>
                  <span className="progress-message">{progress.message}</span>
                  <span className="progress-percentage">{progress.progress}%</span>
                </div>
                <div className="progress-bar-container">
                  <div 
                    className={`progress-bar ${progress.status === 'error' ? 'progress-bar-error' : ''}`}
                    style={{ width: `${progress.progress}%` }}
                  ></div>
                </div>
                <div className="progress-status">
                  Status: <strong>{progress.status.replace(/_/g, ' ').toUpperCase()}</strong>
                </div>
                {progress.status === 'error' && progress.result?.error && (
                  <div className="error-details">
                    <strong>Error Details:</strong> {progress.result.error}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="error-message">
                <span className="error-icon">❌</span>
                {error}
              </div>
            )}

            {progress?.result?.readyForApproval && (
              <div className="preview-section">
                <h3>📺 Preview & Approve</h3>
                
                {progress.result.script && (
                  <div className="preview-content">
                    <div className="preview-item">
                      <strong>Title:</strong>
                      <p>{progress.result.script.title}</p>
                    </div>
                    
                    {getThumbnailPreviewUrl(progress.result.thumbnailPath) && (
                      <div className="preview-item">
                        <strong>Thumbnail:</strong>
                        <div className="thumbnail-preview">
                          <img 
                            src={getThumbnailPreviewUrl(progress.result.thumbnailPath)!} 
                            alt="Video thumbnail"
                            className="thumbnail-image"
                          />
                        </div>
                      </div>
                    )}

                    {getVideoPreviewUrl(progress.result.videoPath) && (
                      <div className="preview-item">
                        <strong>Video Preview:</strong>
                        <div className="video-preview">
                          <video 
                            controls 
                            src={getVideoPreviewUrl(progress.result.videoPath)!}
                            className="preview-video"
                          >
                            Your browser does not support the video tag.
                          </video>
                        </div>
                      </div>
                    )}

                    {progress.result.script.tags && progress.result.script.tags.length > 0 && (
                      <div className="preview-item">
                        <strong>Tags:</strong>
                        <div className="tags">
                          {progress.result.script.tags.map((tag, i) => (
                            <span key={i} className="tag">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {progress.result.script.description && (
                      <div className="preview-item">
                        <strong>Description:</strong>
                        <p className="description">{progress.result.script.description}</p>
                      </div>
                    )}

                    <div className="approve-actions">
                      <button
                        className="approve-button"
                        onClick={() => handleApproveAndUpload(progress.jobId)}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <>
                            <span className="spinner"></span>
                            Uploading to YouTube...
                          </>
                        ) : (
                          <>
                            <span>✅</span>
                            Approve & Upload to YouTube
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {progress?.result?.videoUrl && (
              <div className="success-section">
                <h3>🎉 Video Uploaded Successfully!</h3>
                <a 
                  href={progress.result.videoUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="youtube-link"
                >
                  🎥 Watch on YouTube
                </a>
                {progress.result.blogUrl && (
                  <a 
                    href={progress.result.blogUrl} 
                    className="youtube-link"
                    style={{ marginTop: '10px', display: 'block' }}
                  >
                    📝 Read Blog Post
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="info-card">
            <h3>How It Works</h3>
            <ol className="steps-list">
              <li>🔍 Scrapes latest crypto news from top sources</li>
              <li>🤖 AI analyzes and distills top 3-4 trending topics</li>
              <li>✍️ Generates engaging script for "Crypto B" avatar</li>
              <li>🎬 Creates video with text-to-speech and avatar</li>
              <li>🖼️ Generates eye-catching thumbnail</li>
              <li>👀 Preview video and thumbnail</li>
              <li>✅ Approve and upload to YouTube</li>
            </ol>
          </div>
        </main>
        )}
      </div>
    </div>
  );
}

export default App;
