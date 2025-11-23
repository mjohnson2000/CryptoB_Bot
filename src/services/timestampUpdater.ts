import { VideoScript } from './aiService.js';
import { getVideoDuration } from './videoGenerator.js';

/**
 * Updates the video description with accurate timestamps based on actual video duration
 * and script content analysis
 */
export async function updateDescriptionWithTimestamps(
  script: VideoScript,
  videoPath: string
): Promise<VideoScript> {
  try {
    // Get actual video duration
    const videoDuration = await getVideoDuration(videoPath);
    
    if (videoDuration === 0) {
      console.warn('Could not get video duration, keeping original description');
      return script;
    }

    // Parse the script to identify topic sections
    const scriptLines = script.script.split('\n').filter(line => line.trim().length > 0);
    const topics = script.topics || [];
    
    // Calculate timestamps based on actual video duration
    // Use proportional distribution to ensure accuracy
    const timestamps: { topic: string; time: string }[] = [];
    
    // Reserve time for intro (10% of video, max 20 seconds) and outro (5% of video, max 10 seconds)
    const introTime = Math.min(videoDuration * 0.1, 20);
    const outroReserveTime = Math.min(videoDuration * 0.05, 10);
    const availableTime = videoDuration - introTime - outroReserveTime;
    
    // Distribute available time among topics proportionally
    // Find where each topic appears in the script to get better estimates
    const topicPositions: { topic: string; position: number; time: number }[] = [];
    
    topics.forEach((topic, index) => {
      // Search for topic keywords in script
      const topicKeywords = topic.title.split(' ').slice(0, 3).filter(w => w.length > 2);
      let foundPosition = -1;
      
      // Find first occurrence of topic in script
      for (let i = 0; i < scriptLines.length; i++) {
        const line = scriptLines[i].toLowerCase();
        if (topicKeywords.some(keyword => line.includes(keyword.toLowerCase()))) {
          foundPosition = i;
          break;
        }
      }
      
      // Calculate proportional time based on position in script
      // If found, use position; otherwise distribute evenly
      const scriptPosition = foundPosition >= 0 
        ? foundPosition / scriptLines.length 
        : (index + 1) / (topics.length + 1);
      
      // Calculate time: intro time + proportional share of available time
      const topicTime = introTime + (scriptPosition * availableTime);
      
      // Ensure time doesn't exceed video duration
      const clampedTime = Math.min(topicTime, videoDuration - outroReserveTime - 5);
      
      topicPositions.push({
        topic: topic.title,
        position: scriptPosition,
        time: clampedTime
      });
    });
    
    // Sort by time and format timestamps
    topicPositions.sort((a, b) => a.time - b.time);
    
    topicPositions.forEach(({ topic, time }) => {
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      timestamps.push({ topic, time: timeStr });
    });
    
    console.log(`📊 Timestamp calculation: Video=${videoDuration.toFixed(1)}s, Intro=${introTime.toFixed(1)}s, Available=${availableTime.toFixed(1)}s, Outro=${outroReserveTime.toFixed(1)}s`);
    
    // Update description with accurate timestamps
    // IMPORTANT: Preserve the reference links section at the end
    const referenceLinksMatch = script.description.match(/(\n\n📚 REFERENCE LINKS.*$)/s);
    const referenceLinksSection = referenceLinksMatch ? referenceLinksMatch[1] : '';
    
    // Remove everything from reference links onwards, and also remove ALL existing timestamps
    let updatedDescription = script.description.replace(/\n\n📚 REFERENCE LINKS.*$/s, '');
    
    // Remove ALL existing timestamp lines (format: MM:SS - text or MM:SS - text)
    // This ensures we start fresh with accurate timestamps
    updatedDescription = updatedDescription.replace(/^\d{1,2}:\d{2}\s*-\s*.+$/gm, '');
    updatedDescription = updatedDescription.replace(/\n{3,}/g, '\n\n'); // Clean up extra newlines
    
    console.log(`📹 Video duration: ${Math.floor(videoDuration / 60)}:${Math.floor(videoDuration % 60).toString().padStart(2, '0')}`);
    console.log(`📝 Calculated ${timestamps.length} topic timestamps`);
    
    // Build new timestamp section with accurate times
    let timestampSection = '';
    
    // Add intro timestamp
    timestampSection += '0:00 - Intro\n';
    
    // Add topic timestamps (ensure they don't exceed video duration)
    timestamps.forEach(({ topic, time }) => {
      // Parse the time to ensure it's within video duration
      const [mins, secs] = time.split(':').map(Number);
      const timeInSeconds = mins * 60 + secs;
      
      if (timeInSeconds < videoDuration) {
        timestampSection += `${time} - ${topic}\n`;
      } else {
        // If calculated time exceeds video, use a proportional time
        const adjustedTime = Math.floor(videoDuration * 0.8); // Use 80% of video as fallback
        const adjMins = Math.floor(adjustedTime / 60);
        const adjSecs = adjustedTime % 60;
        timestampSection += `${adjMins}:${adjSecs.toString().padStart(2, '0')} - ${topic}\n`;
        console.warn(`⚠️ Adjusted timestamp for "${topic}" to fit within video duration`);
      }
    });
    
    // Add outro timestamp (use actual video duration)
    const outroMinutes = Math.floor(videoDuration / 60);
    const outroSeconds = Math.floor(videoDuration % 60);
    const outroTime = `${outroMinutes}:${outroSeconds.toString().padStart(2, '0')}`;
    timestampSection += `${outroTime} - Outro`;
    
    // Insert timestamp section after the main description content
    // Find where to insert (usually after paragraphs, before any existing sections)
    const descriptionParts = updatedDescription.split(/\n\n/);
    const mainContent = descriptionParts.filter(p => 
      !p.match(/^\d{1,2}:\d{2}/) && 
      !p.includes('REFERENCE LINKS') &&
      !p.includes('Want to dive deeper')
    ).join('\n\n');
    
    // Insert timestamps after main content
    updatedDescription = mainContent + '\n\n' + timestampSection;
    
    // Restore reference links section at the end
    if (referenceLinksSection) {
      updatedDescription += referenceLinksSection;
      console.log('✅ Preserved reference links section in description');
    }
    
    return {
      ...script,
      description: updatedDescription
    };
  } catch (error) {
    console.error('Error updating timestamps:', error);
    return script; // Return original if update fails
  }
}

