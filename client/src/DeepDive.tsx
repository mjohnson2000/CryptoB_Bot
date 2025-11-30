import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// EST timezone helpers (America/New_York handles EST/EDT automatically)
const EST_TIMEZONE = 'America/New_York';

// Convert EST datetime-local string to UTC ISO string
function estToUTC(estDateTime: string): string {
  const [datePart, timePart] = estDateTime.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  const estDateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  const estDate = new Date(estDateString);
  
  // Get EST offset for this date (handles DST)
  const estOffsetMs = getESTOffsetMs(estDate);
  const utcDateFinal = new Date(estDate.getTime() - estOffsetMs);
  return utcDateFinal.toISOString();
}

// Get EST offset in milliseconds for a given date (handles DST automatically)
function getESTOffsetMs(date: Date): number {
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

interface TopicRequest {
  topic: string;
  count: number;
  comments: Array<{
    text: string;
    videoId: string;
    videoTitle: string;
    author: string;
  }>;
  lastUpdated: string;
}

interface DeepDiveProgress {
  jobId: string;
  status: 'pending' | 'fetching_comments' | 'analyzing_topics' | 'generating_script' | 'creating_video' | 'creating_thumbnail' | 'ready' | 'uploading' | 'completed' | 'error';
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
    topic?: string;
    error?: string;
  };
}

interface DeepDiveAutomationState {
  isRunning: boolean;
  cadenceHours: number;
  lastRun?: string;
  nextRun?: string;
  currentJobId?: string;
}

function DeepDive() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<DeepDiveProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mostRequestedTopic, setMostRequestedTopic] = useState<TopicRequest | null>(null);
  const [automationState, setAutomationState] = useState<DeepDiveAutomationState | null>(null);
  const [cadenceInput, setCadenceInput] = useState<string>('24');
  const [startTimeInput, setStartTimeInput] = useState<string>('');
  const [automationLoading, setAutomationLoading] = useState(false);

  useEffect(() => {
    loadMostRequestedTopic();
    fetchAutomationStatus();
    
    // Poll automation status every 5 seconds
    const interval = setInterval(fetchAutomationStatus, 5000);
    return () => clearInterval(interval);
  }, []);


  const loadMostRequestedTopic = async () => {
    try {
      const response = await axios.get<{ success: boolean; topic: TopicRequest | null }>('/api/deepdive/topics');
      setMostRequestedTopic(response.data.topic);
    } catch (err) {
      console.error('Error loading most requested topic:', err);
    }
  };

  // Fetch automation status from server
  // NOTE: Automation runs on the server and persists across page refreshes.
  // This function only fetches and displays the current state - it does NOT control automation.
  // Automation can only be stopped by clicking the Stop button (which calls the API).
  const fetchAutomationStatus = async () => {
    try {
      const response = await axios.get<{ success: boolean; isRunning: boolean; cadenceHours: number; lastRun?: string; nextRun?: string; currentJobId?: string }>('/api/deepdive/automation/status');
      if (response.data.success) {
        setAutomationState({
          isRunning: response.data.isRunning,
          cadenceHours: response.data.cadenceHours,
          lastRun: response.data.lastRun,
          nextRun: response.data.nextRun,
          currentJobId: response.data.currentJobId
        });
        if (!cadenceInput || cadenceInput === '24') {
          setCadenceInput(response.data.cadenceHours.toString());
        }
      }
    } catch (err) {
      // Don't update state on error - keep showing last known state
      // This ensures automation appears to continue running even if there's a temporary network issue
      console.error('Error fetching deep dive automation status:', err);
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
      const response = await axios.post('/api/deepdive/automation/start', payload);
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
      const response = await axios.post('/api/deepdive/automation/stop');
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
      const response = await axios.post('/api/deepdive/automation/cadence', { hours });
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

  const handleCreateDeepDive = async (topic?: string) => {
    console.log('Create deep dive clicked, topic:', topic);
    setLoading(true);
    setError(null);
    
    const initialProgress: DeepDiveProgress = {
      jobId: '',
      status: 'pending',
      progress: 0,
      message: 'Initializing deep dive video creation...'
    };
    setProgress(initialProgress);

    try {
      console.log('Sending request to /api/deepdive/create with topic:', topic);
      const response = await axios.post<{ success: boolean; jobId: string; message: string }>('/api/deepdive/create', {
        topic: topic || undefined
      });
      
      console.log('Response received:', response.data);
      
      if (response.data.jobId) {
        setProgress(prev => prev ? { ...prev, jobId: response.data.jobId } : initialProgress);
        pollStatus(response.data.jobId);
      } else {
        throw new Error('No jobId received from server');
      }
    } catch (err) {
      console.error('Error creating deep dive:', err);
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
      setLoading(false);
      setProgress(null);
    }
  };

  const pollStatus = async (jobId: string) => {
    const maxAttempts = 120;
    let attempts = 0;
    let interval: NodeJS.Timeout | null = null;

    const poll = async () => {
      attempts++;
      
      try {
        const response = await axios.get<{ success: boolean; progress: DeepDiveProgress }>(`/api/deepdive/progress/${jobId}`);
        setProgress(response.data.progress);
        setLoading(response.data.progress.status !== 'ready' && response.data.progress.status !== 'completed' && response.data.progress.status !== 'error');

        if (response.data.progress.status === 'error') {
          if (interval) clearInterval(interval);
          setLoading(false);
          if (response.data.progress.result?.error) {
            setError(response.data.progress.result.error);
          } else if (response.data.progress.message) {
            setError(response.data.progress.message);
          }
        } else if (response.data.progress.status === 'completed' || response.data.progress.status === 'ready') {
          if (interval) clearInterval(interval);
          setLoading(false);
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          // Job not found - might have been cleared
          if (interval) clearInterval(interval);
          setLoading(false);
          setError('Job not found. It may have expired.');
        } else {
          console.error('Error polling status:', err);
        }
      }

      if (attempts >= maxAttempts) {
        if (interval) clearInterval(interval);
        setLoading(false);
        setError('Timeout waiting for video creation. Please check the server logs.');
      }
    };

    // Poll immediately, then every 2 seconds
    poll();
    interval = setInterval(poll, 2000);
  };

  const handleApproveAndUpload = async (jobId: string) => {
    setUploading(true);
    setError(null);

    try {
      const response = await axios.post<{ success: boolean; result?: { videoId: string; videoUrl: string } }>(`/api/deepdive/approve/${jobId}`);
      
      if (response.data.success && response.data.result) {
        setProgress(prev => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'completed',
            progress: 100,
            message: 'Video uploaded successfully!',
            result: {
              success: true,
              videoId: response.data.result!.videoId,
              videoUrl: response.data.result!.videoUrl,
              readyForApproval: false,
              script: prev.result?.script,
              videoPath: prev.result?.videoPath,
              thumbnailPath: prev.result?.thumbnailPath,
              topic: prev.result?.topic
            }
          };
        });
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

  const getVideoPreviewUrl = (videoPath?: string): string | null => {
    if (!videoPath) return null;
    const filename = videoPath.split('/').pop() || videoPath.split('\\').pop();
    return `/api/video/preview/video/${filename}`;
  };

  const getThumbnailPreviewUrl = (thumbnailPath?: string): string | null => {
    if (!thumbnailPath) {
      console.log('⚠️ No thumbnail path provided');
      return null;
    }
    const filename = thumbnailPath.split('/').pop() || thumbnailPath.split('\\').pop();
    const url = `/api/video/preview/thumbnail/${filename}`;
    console.log('🖼️ Thumbnail URL:', url, 'from path:', thumbnailPath);
    return url;
  };

  return (
    <main className="main">
          {/* Deep Dive Automation Section */}
          <div className="card">
            <div className="card-header">
              <h2>🤖 Automated Deep Dive Creation</h2>
              <p className="card-description">
                Set up automatic deep dive video creation and upload. Videos will be created and uploaded automatically once per day (or your specified interval).
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
                <label htmlFor="deepdive-cadence-input">Cadence (hours):</label>
                <div className="cadence-input-group">
                  <input
                    id="deepdive-cadence-input"
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
                  <label htmlFor="deepdive-start-time-input">First Upload Time (optional):</label>
                  <input
                    id="deepdive-start-time-input"
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
                        Start Deep Dive Automation
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
                        Stop Deep Dive Automation
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {mostRequestedTopic ? (
            <div className="card">
              <h3>🔥 Most Requested Topic</h3>
              <div className="topic-card">
                <h4>{mostRequestedTopic.topic}</h4>
                <p><strong>{mostRequestedTopic.count}</strong> requests from comments</p>
                <button
                  className="create-button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔥 BUTTON CLICKED! Topic:', mostRequestedTopic.topic, 'Loading:', loading);
                    console.log('🔥 Button element:', e.target);
                    console.log('🔥 Event type:', e.type);
                    if (!loading) {
                      handleCreateDeepDive(mostRequestedTopic.topic);
                    } else {
                      console.warn('⚠️ Button is disabled (loading=true)');
                    }
                  }}
                  onMouseDown={() => {
                    console.log('🖱️ Mouse down on button');
                  }}
                  disabled={loading}
                  style={{ 
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    pointerEvents: loading ? 'none' : 'auto'
                  }}
                >
                  {loading ? 'Creating...' : `Create Deep Dive on ${mostRequestedTopic.topic}`}
                </button>
              </div>
            </div>
          ) : (
            <div className="card">
              <h3>🎯 Create Deep Dive</h3>
              <p>No topic requests from comments yet. Create a deep dive on a trending topic from the latest crypto news:</p>
              <button
                className="create-button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🔥 BUTTON CLICKED! (No topic) Loading state:', loading);
                  console.log('🔥 Button element:', e.target);
                  if (!loading) {
                    handleCreateDeepDive();
                  } else {
                    console.warn('⚠️ Button is disabled (loading=true)');
                  }
                }}
                onMouseDown={() => {
                  console.log('🖱️ Mouse down on button (no topic)');
                }}
                disabled={loading}
                style={{ 
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  pointerEvents: loading ? 'none' : 'auto'
                }}
              >
                {loading ? 'Creating...' : 'Create Deep Dive (AI will select trending topic)'}
              </button>
              {loading && <p style={{ marginTop: '10px', color: '#F7931A' }}>⏳ Creating video...</p>}
            </div>
          )}

          {error && (
            <div className="card error">
              <h3>❌ Error</h3>
              <p>{error}</p>
            </div>
          )}

          {progress && (
            <div className="card">
              <h3>📊 Progress</h3>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${progress.progress}%` }}
                ></div>
              </div>
              <p className="progress-text">
                <strong>{progress.status.replace(/_/g, ' ').toUpperCase()}</strong> - {progress.message}
              </p>

              {progress.result?.readyForApproval && progress.result.script && (
                <div className="preview-section">
                  <h4>✅ Video Ready for Approval</h4>
                  
                  {progress.result.script.title && (
                    <div className="preview-item">
                      <strong>Title:</strong>
                      <p>{progress.result.script.title}</p>
                    </div>
                  )}

                  {progress.result?.thumbnailPath && (
                    <div className="preview-item">
                      <strong>Thumbnail:</strong>
                      <div className="thumbnail-preview">
                        <img 
                          src={getThumbnailPreviewUrl(progress.result.thumbnailPath)!} 
                          alt="Deep dive thumbnail"
                          className="thumbnail-image"
                          onError={() => {
                            console.error('❌ Thumbnail image failed to load:', getThumbnailPreviewUrl(progress.result?.thumbnailPath));
                            console.error('Thumbnail path:', progress.result?.thumbnailPath);
                          }}
                          onLoad={() => {
                            console.log('✅ Thumbnail loaded successfully:', getThumbnailPreviewUrl(progress.result?.thumbnailPath));
                          }}
                        />
                      </div>
                      <p style={{ fontSize: '0.9rem', color: '#888', marginTop: '0.5rem' }}>
                        Path: {progress.result.thumbnailPath}
                      </p>
                    </div>
                  )}

                  {progress.result.videoPath && (
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
            <div className="card success">
              <h3>🎉 Deep Dive Video Uploaded Successfully!</h3>
              <a 
                href={progress.result.videoUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="youtube-link"
              >
                🎥 Watch on YouTube
              </a>
            </div>
          )}

          {/* How Deep Dive Videos Work Section - Moved to bottom */}
          <div className="card">
            <h3>📝 How Deep Dive Videos Work</h3>
            <ul className="steps-list">
              <li>📊 Analyzes comments from your recent videos</li>
              <li>🤖 AI identifies topics viewers want to learn more about</li>
              <li>🎯 Creates a 5-minute deep dive on the most requested topic</li>
              <li>📰 If no comments found, AI selects a trending topic from latest crypto news</li>
              <li>⏰ New deep dive videos are created once per day automatically</li>
              <li>💬 Based on YOUR comments - tell us what you want to learn!</li>
            </ul>
          </div>
    </main>
  );
}

export default DeepDive;

