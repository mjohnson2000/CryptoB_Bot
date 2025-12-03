import { scrapeCryptoNews, NewsArticle } from './newsScraper.js';
import { getPriceMovements, PriceMovement } from './priceData.js';

export interface TopicResearch {
  topic: string;
  recentArticles: NewsArticle[];
  priceData?: PriceMovement;
  relatedTopics: string[];
  keyPoints: string[];
  timestamp: Date;
}

/**
 * Research a specific crypto topic by:
 * 1. Scraping recent news/articles about the topic
 * 2. Getting price data if it's a coin/token
 * 3. Identifying related topics
 * 4. Extracting key points
 */
export async function researchTopic(topic: string): Promise<TopicResearch> {
  try {
    console.log(`🔍 Researching topic: "${topic}"`);
    
    // Step 1: Scrape recent news (last 48 hours for deep dive research)
    const allArticles = await scrapeCryptoNews();
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recentArticles = allArticles.filter(article => 
      article.timestamp >= fortyEightHoursAgo
    );
    
    // Filter articles relevant to the topic
    const topicArticles = filterArticlesByTopic(recentArticles, topic);
    console.log(`📰 Found ${topicArticles.length} relevant articles about "${topic}"`);
    
    // Step 2: Check if topic is a coin/token and get price data
    const priceData = await getPriceDataForTopic(topic);
    if (priceData) {
      console.log(`💰 Found price data for "${topic}": $${priceData.price} (${priceData.change24h > 0 ? '+' : ''}${priceData.change24h.toFixed(2)}%)`);
    }
    
    // Step 3: Identify related topics from articles
    const relatedTopics = extractRelatedTopics(topicArticles, topic);
    console.log(`🔗 Found ${relatedTopics.length} related topics`);
    
    // Step 4: Extract key points from articles
    const keyPoints = extractKeyPoints(topicArticles);
    console.log(`📝 Extracted ${keyPoints.length} key points`);
    
    return {
      topic,
      recentArticles: topicArticles.slice(0, 10), // Limit to top 10 most relevant
      priceData,
      relatedTopics: relatedTopics.slice(0, 5), // Top 5 related topics
      keyPoints: keyPoints.slice(0, 8), // Top 8 key points
      timestamp: new Date()
    };
  } catch (error) {
    console.error(`Error researching topic "${topic}":`, error);
    // Return minimal research data on error
    return {
      topic,
      recentArticles: [],
      relatedTopics: [],
      keyPoints: [],
      timestamp: new Date()
    };
  }
}

/**
 * Filter articles that are relevant to the topic
 */
function filterArticlesByTopic(articles: NewsArticle[], topic: string): NewsArticle[] {
  const topicLower = topic.toLowerCase();
  const topicWords = topicLower.split(/\s+/).filter(w => w.length > 2);
  
  return articles.filter(article => {
    const titleLower = article.title.toLowerCase();
    const summaryLower = (article.summary || '').toLowerCase();
    
    // Check if topic name appears in title or summary
    if (titleLower.includes(topicLower) || summaryLower.includes(topicLower)) {
      return true;
    }
    
    // Check if significant words from topic appear in title
    const matchingWords = topicWords.filter(word => 
      titleLower.includes(word) || summaryLower.includes(word)
    );
    
    // If at least 2 significant words match, consider it relevant
    return matchingWords.length >= 2;
  });
}

/**
 * Get price data if the topic is a coin/token
 */
async function getPriceDataForTopic(topic: string): Promise<PriceMovement | undefined> {
  try {
    // Common coin symbols and names mapping
    const coinMappings: Record<string, string[]> = {
      'bitcoin': ['BTC', 'bitcoin'],
      'btc': ['BTC', 'bitcoin'],
      'ethereum': ['ETH', 'ethereum'],
      'eth': ['ETH', 'ethereum'],
      'solana': ['SOL', 'solana'],
      'sol': ['SOL', 'solana'],
      'cardano': ['ADA', 'cardano'],
      'ada': ['ADA', 'cardano'],
      'polkadot': ['DOT', 'polkadot'],
      'dot': ['DOT', 'polkadot'],
      'polygon': ['MATIC', 'polygon'],
      'matic': ['MATIC', 'polygon'],
      'avalanche': ['AVAX', 'avalanche'],
      'avax': ['AVAX', 'avalanche'],
      'chainlink': ['LINK', 'chainlink'],
      'link': ['LINK', 'chainlink'],
      'uniswap': ['UNI', 'uniswap'],
      'uni': ['UNI', 'uniswap'],
      'litecoin': ['LTC', 'litecoin'],
      'ltc': ['LTC', 'litecoin'],
      'ripple': ['XRP', 'ripple'],
      'xrp': ['XRP', 'ripple'],
      'dogecoin': ['DOGE', 'dogecoin'],
      'doge': ['DOGE', 'dogecoin'],
      'binance coin': ['BNB', 'binance coin'],
      'bnb': ['BNB', 'binance coin']
    };
    
    const topicLower = topic.toLowerCase();
    const symbol = coinMappings[topicLower]?.[0];
    
    if (!symbol) {
      // Topic might not be a coin, return undefined
      return undefined;
    }
    
    // Get price movements
    const priceUpdate = await getPriceMovements();
    
    // Search in ticker coins (top 25 by market cap)
    const coin = priceUpdate.tickerCoins?.find(c => 
      c.symbol === symbol || c.name.toLowerCase() === topicLower
    );
    
    if (coin) {
      return coin;
    }
    
    // Also check winners/losers
    const winner = priceUpdate.topWinners.find(c => 
      c.symbol === symbol || c.name.toLowerCase() === topicLower
    );
    if (winner) return winner;
    
    const loser = priceUpdate.topLosers.find(c => 
      c.symbol === symbol || c.name.toLowerCase() === topicLower
    );
    if (loser) return loser;
    
    return undefined;
  } catch (error) {
    console.error('Error getting price data for topic:', error);
    return undefined;
  }
}

/**
 * Extract related topics from articles
 */
function extractRelatedTopics(articles: NewsArticle[], mainTopic: string): string[] {
  const topicCounts = new Map<string, number>();
  const mainTopicLower = mainTopic.toLowerCase();
  
  // Common crypto terms to look for
  const cryptoTerms = [
    'bitcoin', 'ethereum', 'defi', 'nft', 'web3', 'staking', 'mining',
    'blockchain', 'smart contract', 'dao', 'governance', 'token',
    'exchange', 'wallet', 'metaverse', 'gamefi', 'regulation', 'sec',
    'adoption', 'institutional', 'halving', 'upgrade', 'fork', 'airdrop'
  ];
  
  articles.forEach(article => {
    const text = `${article.title} ${article.summary || ''}`.toLowerCase();
    
    cryptoTerms.forEach(term => {
      if (text.includes(term) && !text.includes(mainTopicLower)) {
        const count = topicCounts.get(term) || 0;
        topicCounts.set(term, count + 1);
      }
    });
  });
  
  // Sort by frequency and return top related topics
  return Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic.charAt(0).toUpperCase() + topic.slice(1));
}

/**
 * Extract key points from articles
 */
function extractKeyPoints(articles: NewsArticle[]): string[] {
  const keyPoints: string[] = [];
  
  // Extract summaries and titles as key points
  articles.slice(0, 10).forEach(article => {
    if (article.summary && article.summary.length > 20) {
      // Take first sentence of summary as key point
      const firstSentence = article.summary.split(/[.!?]/)[0].trim();
      if (firstSentence.length > 20 && firstSentence.length < 150) {
        keyPoints.push(firstSentence);
      }
    } else if (article.title.length > 20 && article.title.length < 100) {
      keyPoints.push(article.title);
    }
  });
  
  // Remove duplicates (similar key points)
  const uniqueKeyPoints: string[] = [];
  keyPoints.forEach(point => {
    const isDuplicate = uniqueKeyPoints.some(existing => {
      const similarity = calculateSimilarity(existing.toLowerCase(), point.toLowerCase());
      return similarity > 0.7; // 70% similarity threshold
    });
    
    if (!isDuplicate) {
      uniqueKeyPoints.push(point);
    }
  });
  
  return uniqueKeyPoints;
}

/**
 * Simple similarity calculation (Jaccard similarity)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 3));
  
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.length / union.size : 0;
}

