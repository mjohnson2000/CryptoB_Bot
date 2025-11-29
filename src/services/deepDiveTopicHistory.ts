import fs from 'fs/promises';
import path from 'path';

export interface DeepDiveTopicEntry {
  topic: string;
  timestamp: Date;
  videoId?: string;
  videoUrl?: string;
  jobId?: string;
}

// Store deep dive topic history in a JSON file
// This persists across server restarts
class DeepDiveTopicHistoryStore {
  private history: DeepDiveTopicEntry[] = [];
  private readonly historyFilePath: string;
  private readonly MAX_HISTORY_ENTRIES = 50; // Store last 50 deep dive topics
  private loadPromise: Promise<void> | null = null;

  constructor() {
    this.historyFilePath = path.join(process.cwd(), 'deep-dive-topics-history.json');
    this.loadPromise = this.loadHistory();
    // Don't await here - let it load in background, but ensure it completes before first use
  }

  /**
   * Ensure history is loaded before use
   */
  private async ensureHistoryLoaded(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
      this.loadPromise = null; // Mark as loaded
    }
  }

  /**
   * Load history from file
   */
  private async loadHistory(): Promise<void> {
    try {
      const data = await fs.readFile(this.historyFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      this.history = parsed.map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp)
      }));
      console.log(`📚 Loaded ${this.history.length} deep dive topics from history`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - that's okay
        console.log('📚 No existing deep dive topic history found. Starting fresh.');
      } else {
        console.error('Error loading deep dive topic history:', error);
      }
    }
  }

  /**
   * Save history to file
   */
  private async saveHistory(): Promise<void> {
    try {
      await fs.writeFile(
        this.historyFilePath,
        JSON.stringify(this.history, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Error saving deep dive topic history:', error);
    }
  }

  /**
   * Add a deep dive topic to history
   */
  async addTopic(topic: string, jobId?: string, videoId?: string, videoUrl?: string): Promise<void> {
    await this.ensureHistoryLoaded();
    const entry: DeepDiveTopicEntry = {
      topic: topic.trim(),
      timestamp: new Date(),
      jobId,
      videoId,
      videoUrl
    };

    this.history.push(entry);

    // Keep only recent entries
    if (this.history.length > this.MAX_HISTORY_ENTRIES) {
      this.history = this.history
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, this.MAX_HISTORY_ENTRIES);
    }

    await this.saveHistory();
    console.log(`📚 Added deep dive topic to history: "${topic}" (Total: ${this.history.length})`);
  }

  /**
   * Check if a topic was already covered in a deep dive
   * Note: This is synchronous for performance, but history should be loaded first
   */
  wasTopicCovered(topic: string): boolean {
    // If history is still loading, it's okay - we'll check against empty array
    // This is safe because worst case we allow a duplicate (which is better than blocking)
    const normalizedTopic = this.normalizeTopic(topic);
    
    return this.history.some(entry => {
      const normalizedEntry = this.normalizeTopic(entry.topic);
      return this.isTopicSimilar(normalizedTopic, normalizedEntry);
    });
  }

  /**
   * Get all covered topics (for filtering)
   */
  async getCoveredTopics(): Promise<string[]> {
    await this.ensureHistoryLoaded();
    return this.history.map(entry => entry.topic);
  }

  /**
   * Get recent deep dive topics (within specified hours)
   */
  async getRecentTopics(hoursThreshold: number = 24): Promise<DeepDiveTopicEntry[]> {
    await this.ensureHistoryLoaded();
    const thresholdTime = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
    return this.history
      .filter(entry => entry.timestamp >= thresholdTime)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Normalize topic string for comparison
   */
  private normalizeTopic(topic: string): string {
    return topic
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Check if two topics are similar (to detect duplicates)
   */
  private isTopicSimilar(topic1: string, topic2: string): boolean {
    // Exact match after normalization
    if (topic1 === topic2) {
      return true;
    }

    // Check for significant word overlap
    const words1 = new Set(topic1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(topic2.split(/\s+/).filter(w => w.length > 2));
    
    // If one topic is contained in the other
    if (topic1.includes(topic2) || topic2.includes(topic1)) {
      return true;
    }

    // Check for significant word overlap (at least 50% of words match)
    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);
    
    if (union.size === 0) return false;
    
    // If more than 50% of words overlap, consider them similar
    const similarity = intersection.length / union.size;
    return similarity >= 0.5;
  }

  /**
   * Filter out already-covered topics from a list
   */
  async filterCoveredTopics(topics: Array<{ topic: string; [key: string]: any }>): Promise<Array<{ topic: string; [key: string]: any }>> {
    await this.ensureHistoryLoaded();
    return topics.filter(item => !this.wasTopicCovered(item.topic));
  }

  /**
   * Clear history (useful for testing)
   */
  async clear(): Promise<void> {
    await this.ensureHistoryLoaded();
    this.history = [];
    await this.saveHistory();
    console.log('📚 Deep dive topic history cleared');
  }

  /**
   * Get history stats
   */
  async getStats(): Promise<{ totalEntries: number; recentEntries: number }> {
    await this.ensureHistoryLoaded();
    const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return {
      totalEntries: this.history.length,
      recentEntries: this.history.filter(e => e.timestamp >= recentThreshold).length
    };
  }
}

// Singleton instance
export const deepDiveTopicHistory = new DeepDiveTopicHistoryStore();

