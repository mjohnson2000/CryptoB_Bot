import { VideoScript, NFTUpdate } from './aiService.js';
import { PriceUpdate } from './priceData.js';
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
    
    // Reserve time for sections:
    // - Intro: ~15 seconds
    // - Price update: ~30 seconds (after intro)
    // - NFT update: ~30 seconds (before outro)
    // - Outro: ~15 seconds
    const introTime = 15;
    const priceUpdateTime = 30;
    const nftUpdateTime = 30;
    const outroTime = 15;
    const reservedTime = introTime + priceUpdateTime + nftUpdateTime + outroTime;
    const availableTime = Math.max(0, videoDuration - reservedTime);
    
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
      
      // Calculate time: intro + price update + proportional share of available time (for main news)
      // Main news starts after intro + price update
      const mainNewsStart = introTime + priceUpdateTime;
      const topicTime = mainNewsStart + (scriptPosition * availableTime);
      
      // Ensure time doesn't exceed NFT update section
      const clampedTime = Math.min(topicTime, videoDuration - nftUpdateTime - outroTime - 5);
      
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
    
    console.log(`📊 Timestamp calculation: Video=${videoDuration.toFixed(1)}s, Intro=${introTime}s, Price=${priceUpdateTime}s, Main News=${availableTime.toFixed(1)}s, NFT=${nftUpdateTime}s, Outro=${outroTime}s`);
    
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
    
    // Add price update timestamp if available
    if (script.priceUpdate) {
      const priceMinutes = Math.floor((introTime) / 60);
      const priceSeconds = introTime % 60;
      const priceTimeStr = `${priceMinutes}:${priceSeconds.toString().padStart(2, '0')}`;
      timestampSection += `${priceTimeStr} - Price Movement Update\n`;
    }
    
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
    
    // Add NFT update timestamp if available
    if (script.nftUpdate) {
      const nftStartTime = Math.max(0, videoDuration - nftUpdateTime - outroTime);
      const nftStartMinutes = Math.floor(nftStartTime / 60);
      const nftStartSeconds = Math.floor(nftStartTime % 60);
      const nftTimeStr = `${nftStartMinutes}:${nftStartSeconds.toString().padStart(2, '0')}`;
      timestampSection += `${nftTimeStr} - NFT Update\n`;
    }
    
    // Add outro timestamp (use actual video duration)
    const outroMinutes = Math.floor(videoDuration / 60);
    const outroSeconds = Math.floor(videoDuration % 60);
    const outroTimeStr = `${outroMinutes}:${outroSeconds.toString().padStart(2, '0')}`;
    timestampSection += `${outroTimeStr} - Outro`;
    
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

