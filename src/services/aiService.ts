import OpenAI from 'openai';
import { NewsArticle } from './newsScraper.js';

export interface TrendingTopic {
  title: string;
  summary: string;
  importance: number;
  source: string;
}

export interface VideoScript {
  title: string;
  thumbnailTitle?: string; // Optional shorter title for thumbnail
  description: string;
  tags: string[];
  script: string;
  topics: TrendingTopic[];
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

    return sortedTopics;
  } catch (error) {
    console.error('Error distilling topics:', error);
    // Fallback to mock topics
    return getMockTopics();
  }
}

export async function generateVideoScript(
  topics: TrendingTopic[]
): Promise<VideoScript> {
  try {
    const topicsText = topics
      .map((t, i) => `${i + 1}. ${t.title}: ${t.summary}`)
      .join('\n\n');

    const prompt = `You are "Crypto B", a charismatic crypto influencer creating a YouTube video for young degens. Create an engaging video script based on these trending topics:

${topicsText}

Requirements:
- Target audience: Young crypto degens (18-30, meme-loving, risk-tolerant)
- Tone: Energetic, casual, slightly edgy, use crypto slang
- Length: 3-5 minutes of speaking (approximately 450-750 words)
- Structure: Hook intro, cover each topic, engaging transitions, strong outro
- Include: Price movements, market sentiment, potential opportunities
- Use: Crypto terminology (moon, diamond hands, FUD, alpha, etc.)
- IMPORTANT: Mention in the intro and/or outro that this news is from the last 4 hours, and that new videos are posted every 4 hours with the latest crypto updates

Also generate:
1. A catchy YouTube title (under 60 characters, clickbait but accurate)
2. A detailed description (3-4 paragraphs with timestamps) - MUST mention that news is updated every 4 hours and new videos are posted every 4 hours
3. Relevant tags (15-20 tags, comma-separated)

Format your response as JSON:
{
  "title": "Video title",
  "description": "Full description with timestamps",
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

        const shortTitle = thumbnailResponse.choices[0]?.message?.content?.trim();
        if (shortTitle && shortTitle.length <= 50) {
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

    return {
      title: parsed.title || 'Latest Crypto News',
      thumbnailTitle: thumbnailTitle, // Shorter version for thumbnail
      description: parsed.description || '',
      tags: parsed.tags || [],
      script: parsed.script || '',
      topics
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
  return {
    title: '🚀 CRYPTO IS MOONING! Top 3 Stories You NEED to Know',
    description: `What's up degens! Crypto B here with the latest alpha. In this video, we're breaking down the top 3 crypto stories from the last 4 hours.

📅 NEW VIDEOS EVERY 4 HOURS! We bring you the freshest crypto news around the clock, so you never miss the latest moves in the market.

0:00 - Intro
0:30 - ${topics[0]?.title || 'Story 1'}
1:45 - ${topics[1]?.title || 'Story 2'}
3:00 - ${topics[2]?.title || 'Story 3'}
4:15 - Outro

Stay tuned for more crypto alpha! Make sure to subscribe and hit the bell so you don't miss our next update in 4 hours!`,
    tags: ['crypto', 'bitcoin', 'ethereum', 'defi', 'cryptocurrency', 'trading', 'crypto news'],
    script: `Yo what's up degens! Crypto B here, and we've got some absolutely INSANE crypto news dropping in the last 4 hours. That's right - we're bringing you the freshest alpha every 4 hours, so you're always ahead of the game. If you're not paying attention, you're missing out on some serious moves. Let's dive in!

First up, we're seeing Bitcoin absolutely SMASH through resistance levels. This is the kind of move that gets degens excited, and honestly? I'm here for it.

Next, Ethereum is hitting some major milestones with staking. The numbers are wild, and this could be huge for the ecosystem.

And finally, we've got a new DeFi protocol that's absolutely exploding. The TVL numbers are insane, and this could be the next big thing.

That's all for now degens. Keep those diamond hands strong, and remember - we drop fresh crypto news every 4 hours, so make sure you're subscribed and hit that bell to never miss an update. I'll catch you in the next one in 4 hours. Peace!`,
    topics
  };
}

