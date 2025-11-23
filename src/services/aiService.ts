import OpenAI from 'openai';
import { NewsArticle } from './newsScraper.js';

export interface TrendingTopic {
  title: string;
  summary: string;
  importance: number;
  source: string;
  url?: string; // URL to the source article
  isUpdate?: boolean; // True if this topic was recently covered and has updates
}

export interface PriceUpdate {
  topWinners: Array<{ symbol: string; name: string; change24h: number }>;
  topLosers: Array<{ symbol: string; name: string; change24h: number }>;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface NFTUpdate {
  trendingCollections: Array<{ name: string; floorPrice: number; floorPriceChange24h: number }>;
}

export interface VideoScript {
  title: string;
  thumbnailTitle?: string; // Optional shorter title for thumbnail
  description: string;
  tags: string[];
  script: string;
  topics: TrendingTopic[];
  priceUpdate?: PriceUpdate;
  nftUpdate?: NFTUpdate;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return new OpenAI({ apiKey });
}

export async function distillTrendingTopics(
  articles: NewsArticle[]
): Promise<TrendingTopic[]> {
  try {
    const articlesText = articles
      .slice(0, 20)
      .map(a => `- ${a.title} (${a.source})`)
      .join('\n');

    const prompt = `You are analyzing the latest crypto news to identify the top 3-4 most trending and important topics from the last 4 hours. 

Here are the recent articles:
${articlesText}

Analyze these articles and identify the top 3-4 most trending topics. For each topic, provide:
1. A catchy title
2. A brief summary (2-3 sentences)
3. An importance score (1-10)
4. The primary source

Format your response as a JSON object with a "topics" array containing the topics:
{
  "topics": [
    {
      "title": "Topic Title",
      "summary": "Brief summary",
      "importance": 8,
      "source": "Source name"
    }
  ]
}

Only return the JSON object, no other text.`;

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert crypto analyst who identifies trending topics for a young, degen audience.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON response
    const parsed = JSON.parse(content);
    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];

    // Sort by importance and take top 3-4
    const sortedTopics = topics
      .sort((a: TrendingTopic, b: TrendingTopic) => b.importance - a.importance)
      .slice(0, 4);

    // Match topics with articles to get URLs
    // Improved matching: try multiple strategies to find the best match
    const topicsWithUrls = sortedTopics.map((topic: TrendingTopic) => {
      // Strategy 1: Exact source match first
      let matchingArticle = articles.find(article => 
        article.source.toLowerCase() === topic.source.toLowerCase()
      );
      
      // Strategy 2: Title keyword matching (more flexible)
      if (!matchingArticle) {
        const topicKeywords = topic.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        matchingArticle = articles.find(article => {
          const articleTitleLower = article.title.toLowerCase();
          // Check if at least 2 keywords from topic title appear in article title
          const matchingKeywords = topicKeywords.filter(keyword => 
            articleTitleLower.includes(keyword)
          );
          return matchingKeywords.length >= 2;
        });
      }
      
      // Strategy 3: Partial title matching (fallback)
      if (!matchingArticle) {
        matchingArticle = articles.find(article => {
          const articleTitleLower = article.title.toLowerCase();
          const topicTitleLower = topic.title.toLowerCase();
          // Check for significant word overlap
          const articleWords = new Set(articleTitleLower.split(/\s+/).filter(w => w.length > 3));
          const topicWords = new Set(topicTitleLower.split(/\s+/).filter(w => w.length > 3));
          const overlap = [...topicWords].filter(w => articleWords.has(w));
          return overlap.length >= 2;
        });
      }
      
      // Strategy 4: Source-based matching (if source name matches)
      if (!matchingArticle && topic.source) {
        matchingArticle = articles
          .filter(a => a.source.toLowerCase().includes(topic.source.toLowerCase()) || 
                      topic.source.toLowerCase().includes(a.source.toLowerCase()))
          .find(article => {
            // Check if topic summary mentions keywords from article
            const articleKeywords = article.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
            const summaryLower = topic.summary.toLowerCase();
            return articleKeywords.some(keyword => summaryLower.includes(keyword));
          });
      }
      
      if (matchingArticle) {
        console.log(`✅ Matched topic "${topic.title}" with article "${matchingArticle.title}"`);
        return { ...topic, url: matchingArticle.url };
      } else {
        console.warn(`⚠️ Could not find URL for topic: "${topic.title}" (source: ${topic.source})`);
        // Try to get any article from the same source as fallback
        const sourceArticle = articles.find(a => 
          a.source.toLowerCase() === topic.source.toLowerCase()
        );
        if (sourceArticle) {
          console.log(`📎 Using source article as fallback: ${sourceArticle.url}`);
          return { ...topic, url: sourceArticle.url };
        }
      }
      return topic;
    });

    return topicsWithUrls;
  } catch (error) {
    console.error('Error distilling topics:', error);
    // Fallback to mock topics
    return getMockTopics();
  }
}

export async function generateVideoScript(
  topics: TrendingTopic[],
  allTopics?: TrendingTopic[], // All topics before filtering (for context)
  priceUpdate?: PriceUpdate,
  nftUpdate?: NFTUpdate
): Promise<VideoScript> {
  try {
    const topicsText = topics
      .map((t, i) => `${i + 1}. ${t.title}: ${t.summary}${t.url ? ` (Source: ${t.url})` : ''}`)
      .join('\n\n');
    
    // Collect all reference URLs for the description
    let referenceUrls = topics
      .filter(t => t.url)
      .map(t => `- ${t.title}: ${t.url}`)
      .join('\n');
    
    // Debug: Log what we found
    const topicsWithUrls = topics.filter(t => t.url);
    console.log(`📊 Found ${topicsWithUrls.length} topics with URLs out of ${topics.length} total topics`);
    if (topicsWithUrls.length > 0) {
      topicsWithUrls.forEach(t => console.log(`  - ${t.title}: ${t.url}`));
    }

    // Identify which topics are updates vs new
    const updateTopics = topics.filter(t => t.isUpdate).map(t => t.title);
    const newTopics = topics.filter(t => !t.isUpdate).map(t => t.title);
    
    let updateContext = '';
    if (updateTopics.length > 0) {
      updateContext = `\n\nIMPORTANT - CONTENT VARIATION REQUIREMENT:
Some of these topics may have been covered in recent videos. To avoid repetition:
- For topics marked as updates: ${updateTopics.join(', ')}
  * Use a DIFFERENT angle or perspective than previous coverage
  * Focus on NEW developments, updates, or changes since last mention
  * Frame as "Update on..." or "Latest on..." rather than repeating the same story
  * Provide deeper analysis, different insights, or new context
  * Avoid repeating the same narrative or facts from previous videos
  
- For new topics: ${newTopics.join(', ')}
  * These are fresh topics - cover them normally with full context
  
CRITICAL: If a topic was recently covered, you MUST use a different narrative angle, focus on updates, or provide deeper analysis. Never repeat the same story.`;
    }

    // Build price update section text
    let priceSection = '';
    if (priceUpdate) {
      const winnersText = priceUpdate.topWinners.slice(0, 3)
        .map(w => `${w.symbol} (+${w.change24h.toFixed(1)}%)`)
        .join(', ');
      const losersText = priceUpdate.topLosers.slice(0, 3)
        .map(l => `${l.symbol} (${l.change24h.toFixed(1)}%)`)
        .join(', ');
      priceSection = `\n\nPRICE MOVEMENT UPDATE (to be covered right after intro, ~30 seconds):
Top Winners: ${winnersText}
Top Losers: ${losersText}
Market Sentiment: ${priceUpdate.marketSentiment}
Keep this section SHORT, punchy, and energetic. Use phrases like "mooning", "getting rekt", "pumping".`;
    }

    // Build NFT update section text
    let nftSection = '';
    if (nftUpdate) {
      const nftText = nftUpdate.trendingCollections.slice(0, 3)
        .map(nft => `${nft.name} (Floor: ${nft.floorPrice.toFixed(2)} ETH, ${nft.floorPriceChange24h > 0 ? '+' : ''}${nft.floorPriceChange24h.toFixed(1)}%)`)
        .join(', ');
      nftSection = `\n\nNFT UPDATE (to be covered before outro, ~30 seconds):
Trending Collections: ${nftText}
Keep this section SHORT and focused on floor prices and trends.`;
    }

    const prompt = `You are "Crypto B", a charismatic crypto influencer creating a YouTube video for young degens. Create an engaging video script based on these trending topics:

${topicsText}${updateContext}${priceSection}${nftSection}

Requirements:
- Target audience: Young crypto degens (18-30, meme-loving, risk-tolerant)
- Tone: Energetic, casual, slightly edgy, use crypto slang
- Length: 4-6 minutes of speaking (approximately 600-900 words)
- Structure: 
  1. Hook intro (15 seconds) - mention 4-hour updates
  2. Price Movement Update (30 seconds) - top winners/losers, market sentiment
  3. Main News Stories (2-3 minutes) - cover each topic with analysis
  4. NFT Update (30 seconds) - trending collections, floor prices
  5. Strong outro (15 seconds) - subscribe, next update in 4 hours
- Include: Price movements, market sentiment, potential opportunities
- Use: Crypto terminology (moon, diamond hands, FUD, alpha, etc.)
- IMPORTANT: Mention in the intro and/or outro that this news is from the last 4 hours, and that new videos are posted every 4 hours with the latest crypto updates
- CRITICAL: If covering topics that were mentioned in recent videos, use a DIFFERENT angle, focus on UPDATES, or provide DEEPER analysis. Never repeat the same narrative.

Also generate:
1. A catchy YouTube title (under 60 characters, clickbait but accurate)
2. A detailed description (3-4 paragraphs) that:
   - MUST mention that news is updated every 4 hours and new videos are posted every 4 hours
   - Includes accurate timestamps for each topic (format: MM:SS)
   - Mentions that viewers should check the description for reference links to learn more
   - Note: Timestamps will be calculated after video generation, so estimate based on script length (approximately 150 words per minute)
3. Relevant tags (15-20 tags, comma-separated)

IMPORTANT: In the script, mention that viewers should check the description below for reference links to dive deeper into each topic.

Format your response as JSON:
{
  "title": "Video title",
  "description": "Full description with estimated timestamps (will be updated with accurate times)",
  "tags": ["tag1", "tag2", "tag3"],
  "script": "Full script text here"
}`;

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are Crypto B, a popular crypto YouTuber known for breaking down complex crypto news in an entertaining way for degens.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    // Generate a shorter, more catchy thumbnail title
    let thumbnailTitle = parsed.title || 'Latest Crypto News';
    
    // Remove decorative quotation marks (unless it's an actual quote)
    const hasQuoteContext = /\b(said|says|announced|stated|declared|quoted|tweeted|posted|wrote|claimed|revealed)\b/i.test(thumbnailTitle);
    if (!hasQuoteContext) {
      thumbnailTitle = thumbnailTitle.replace(/^["']|["']$/g, ''); // Remove leading/trailing quotes
      thumbnailTitle = thumbnailTitle.replace(/\s*["']\s*/g, ' '); // Remove standalone quotes
      thumbnailTitle = thumbnailTitle.trim();
    }
    
    // If title is too long, ask AI to create a shorter thumbnail version
    if (thumbnailTitle.length > 50) {
      try {
        const thumbnailPrompt = `Create a SHORT, CATCHY thumbnail title for a YouTube video. This will be displayed on a thumbnail image, so it needs to be:
- Maximum 40 characters
- Eye-catching and clickable
- Use power words (BREAKING, SHOCKING, INSANE, MOONING, etc.)
- Keep the main message but make it punchy

Original title: "${thumbnailTitle}"

Return ONLY the short thumbnail title, nothing else.`;

        const thumbnailResponse = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at creating short, catchy YouTube thumbnail titles that grab attention.'
            },
            {
              role: 'user',
              content: thumbnailPrompt
            }
          ],
          temperature: 0.9,
          max_tokens: 50
        });

        let shortTitle = thumbnailResponse.choices[0]?.message?.content?.trim();
        if (shortTitle && shortTitle.length <= 50) {
          // Remove decorative quotes from generated title too
          const hasQuoteContext = /\b(said|says|announced|stated|declared|quoted|tweeted|posted|wrote|claimed|revealed)\b/i.test(shortTitle);
          if (!hasQuoteContext) {
            shortTitle = shortTitle.replace(/^["']|["']$/g, '');
            shortTitle = shortTitle.replace(/\s*["']\s*/g, ' ');
            shortTitle = shortTitle.trim();
          }
          thumbnailTitle = shortTitle;
        }
      } catch (error) {
        console.warn('Failed to generate thumbnail title, using original:', error);
        // Fallback: truncate and add ellipsis if needed
        if (thumbnailTitle.length > 50) {
          thumbnailTitle = thumbnailTitle.substring(0, 47) + '...';
        }
      }
    }

    // Add reference links to description
    let finalDescription = parsed.description || '';
    
    // Always add reference links section if we have any URLs
    if (referenceUrls && referenceUrls.trim().length > 0) {
      const linkCount = topics.filter(t => t.url).length;
      finalDescription += `\n\n📚 REFERENCE LINKS - Check these out for more info on the topics covered:\n\n${referenceUrls}\n\n💡 Want to dive deeper? Click the links above to read the full articles and get all the details!`;
      console.log(`✅ Added ${linkCount} reference links to description`);
    } else {
      console.warn('⚠️ No reference URLs found to add to description');
      console.warn(`   Topics: ${topics.map(t => t.title).join(', ')}`);
      console.warn(`   Topics with URLs: ${topics.filter(t => t.url).map(t => `${t.title} (${t.url})`).join(', ')}`);
      // Still add a note about checking sources
      finalDescription += `\n\n💡 Want to dive deeper? Check out the sources mentioned in the video (${topics.map(t => t.source).filter((v, i, a) => a.indexOf(v) === i).join(', ')}) for more detailed information on each topic!`;
    }
    
    // Note: Timestamps will be updated with accurate times after video generation
    // Remove placeholder notes about estimated timestamps - they'll be updated with accurate times
    finalDescription = finalDescription.replace(/\s*\(estimated[^)]*\)/gi, '');

    return {
      title: parsed.title || 'Latest Crypto News',
      thumbnailTitle: thumbnailTitle, // Shorter version for thumbnail
      description: finalDescription,
      tags: parsed.tags || [],
      script: parsed.script || '',
      topics,
      priceUpdate: priceUpdate,
      nftUpdate: nftUpdate
    };
  } catch (error) {
    console.error('Error generating script:', error);
    // Fallback to mock script
    return getMockScript(topics);
  }
}

function getMockTopics(): TrendingTopic[] {
  return [
    {
      title: 'Bitcoin Breaks $45K Resistance',
      summary: 'BTC surges past major resistance level as institutional buying increases',
      importance: 9,
      source: 'CoinDesk'
    },
    {
      title: 'Ethereum Staking Milestone',
      summary: 'ETH 2.0 staking reaches record levels with 30M+ ETH locked',
      importance: 8,
      source: 'CoinTelegraph'
    },
    {
      title: 'DeFi Protocol Explodes',
      summary: 'New DeFi platform hits $100M TVL in first week',
      importance: 7,
      source: 'CryptoSlate'
    }
  ];
}

function getMockScript(topics: TrendingTopic[]): VideoScript {
  const referenceLinks = topics
    .filter(t => t.url)
    .map(t => `- ${t.title}: ${t.url}`)
    .join('\n');
  
  let description = `What's up degens! Crypto B here with the latest alpha. In this video, we're breaking down the top 3 crypto stories from the last 4 hours.

📅 NEW VIDEOS EVERY 4 HOURS! We bring you the freshest crypto news around the clock, so you never miss the latest moves in the market.

💡 Want to dive deeper? Check the reference links below for more info on each topic!

0:00 - Intro
0:30 - ${topics[0]?.title || 'Story 1'}
1:45 - ${topics[1]?.title || 'Story 2'}
3:00 - ${topics[2]?.title || 'Story 3'}
4:15 - Outro

Stay tuned for more crypto alpha! Make sure to subscribe and hit the bell so you don't miss our next update in 4 hours!`;

  if (referenceLinks) {
    description += `\n\n📚 REFERENCE LINKS - Check these out for more info on the topics covered:\n\n${referenceLinks}\n\n💡 Want to dive deeper? Click the links above to read the full articles and get all the details!`;
  }

  return {
    title: '🚀 CRYPTO IS MOONING! Top 3 Stories You NEED to Know',
    thumbnailTitle: '🚀 CRYPTO MOONING! Top 3 Stories',
    description,
    tags: ['crypto', 'bitcoin', 'ethereum', 'defi', 'cryptocurrency', 'trading', 'crypto news'],
    script: `Yo what's up degens! Crypto B here, and we've got some absolutely INSANE crypto news dropping in the last 4 hours. That's right - we're bringing you the freshest alpha every 4 hours, so you're always ahead of the game. If you're not paying attention, you're missing out on some serious moves. Let's dive in!

First up, we're seeing Bitcoin absolutely SMASH through resistance levels. This is the kind of move that gets degens excited, and honestly? I'm here for it.

Next, Ethereum is hitting some major milestones with staking. The numbers are wild, and this could be huge for the ecosystem.

And finally, we've got a new DeFi protocol that's absolutely exploding. The TVL numbers are insane, and this could be the next big thing.

That's all for now degens. Keep those diamond hands strong, and remember - we drop fresh crypto news every 4 hours, so make sure you're subscribed and hit that bell to never miss an update. I'll catch you in the next one in 4 hours. Peace!`,
    topics
  };
}

