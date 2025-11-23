import { TrendingTopic } from './aiService.js';

export interface TopicHistoryEntry {
  topicTitle: string;
  topicSummary: string;
  source: string;
  timestamp: Date;
  videoJobId?: string;
}

// Store topic history in memory (last 2 videos worth)
// In production, this should be stored in a database
class TopicHistoryStore {
  private history: TopicHistoryEntry[] = [];
  private readonly MAX_HISTORY_ENTRIES = 10; // Store last ~2 videos (assuming 4-5 topics per video)

  /**
   * Add topics from a completed video to history
   */
  addTopics(topics: TrendingTopic[], jobId?: string): void {
    const now = new Date();
    topics.forEach(topic => {
      this.history.push({
        topicTitle: topic.title,
        topicSummary: topic.summary,
        source: topic.source,
        timestamp: now,
        videoJobId: jobId
      });
    });

    // Keep only recent entries
    if (this.history.length > this.MAX_HISTORY_ENTRIES) {
      this.history = this.history
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, this.MAX_HISTORY_ENTRIES);
    }

    console.log(`📚 Added ${topics.length} topics to history. Total history entries: ${this.history.length}`);
  }

  /**
   * Check if a topic was recently covered (within last 1-2 videos)
   */
  wasRecentlyCovered(topicTitle: string, hoursThreshold: number = 8): boolean {
    const thresholdTime = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
    
    return this.history.some(entry => {
      const isRecent = entry.timestamp >= thresholdTime;
      const isSimilar = this.isTopicSimilar(entry.topicTitle, topicTitle);
      return isRecent && isSimilar;
    });
  }

  /**
   * Get the most recent entry for a topic to compare for updates
   */
  getRecentEntry(topicTitle: string): TopicHistoryEntry | null {
    const similarEntries = this.history
      .filter(entry => this.isTopicSimilar(entry.topicTitle, topicTitle))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return similarEntries.length > 0 ? similarEntries[0] : null;
  }

  /**
   * Check if two topic titles are similar (to detect repeats)
   */
  private isTopicSimilar(title1: string, title2: string): boolean {
    const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const words1 = new Set(normalize(title1).split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(normalize(title2).split(/\s+/).filter(w => w.length > 3));
    
    // Check for significant word overlap (at least 2 key words match)
    const intersection = [...words1].filter(w => words2.has(w));
    return intersection.length >= 2;
  }

  /**
   * Get all recently covered topics (for filtering)
   */
  getRecentTopics(hoursThreshold: number = 8): TopicHistoryEntry[] {
    const thresholdTime = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
    return this.history
      .filter(entry => entry.timestamp >= thresholdTime)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Clear history (useful for testing or reset)
   */
  clear(): void {
    this.history = [];
    console.log('📚 Topic history cleared');
  }

  /**
   * Get history stats
   */
  getStats(): { totalEntries: number; recentEntries: number } {
    const recentThreshold = new Date(Date.now() - 8 * 60 * 60 * 1000);
    return {
      totalEntries: this.history.length,
      recentEntries: this.history.filter(e => e.timestamp >= recentThreshold).length
    };
  }
}

// Singleton instance
export const topicHistory = new TopicHistoryStore();

