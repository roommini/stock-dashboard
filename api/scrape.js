const axios = require('axios');
const connectToDatabase = require('./db');
const Event = require('./models/Event');
const OpenAI = require('openai');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    await connectToDatabase();
    
    // We expect the frontend/cron to send { symbol: 'AAPL', keyword: 'Apple' }
    const { symbol, keyword } = req.body || {};
    if (!symbol || !keyword) return res.status(400).json({ error: 'symbol and keyword required in JSON body' });

    // 1. Scrape X.com using Apify API (Mocking this if no API key is provided)
    const APIFY_TOKEN = process.env.APIFY_TOKEN;
    let tweets = [];
    
    if (APIFY_TOKEN) {
      // In production, you would call Apify actor here
      tweets = ["Apple announces new AI integration with OpenAI.", "Apple stock rises after WWDC event."];
    } else {
      // Mock scrape data for demonstration
      tweets = [`Mock tweet about ${keyword} integrating AI`, `Another news about ${symbol} price soaring.`];
    }

    // 2. Analyze with AI (Gemini, OpenAI, or Grok)
    const AI_PROVIDER = process.env.AI_PROVIDER || 'openai'; // 'openai' | 'gemini' | 'grok'
    let aiSummary = { text: `New AI event for ${symbol}`, sentiment: "positive" };
    let sentimentColor = '#ffffff';

    const prompt = `Analyze these tweets about ${keyword} and provide a short 3-6 word summary of the most important event. Also, determine if the sentiment is positive, negative, or neutral. Return JSON format strictly: {"text": "summary here", "sentiment": "positive|negative|neutral"}. Tweets: ${tweets.join(' | ')}`;

    // Note: The actual API calls are mocked below to prevent errors if API keys are missing in Vercel env.
    // In production, uncomment the API calls and ensure env variables are set.
    
    if (AI_PROVIDER === 'gemini') {
      // const { GoogleGenerativeAI } = require('@google/genai');
      // const ai = new GoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
      // Call Gemini logic...
      aiSummary = { text: "AI integration announced", sentiment: "positive" };
    } else if (AI_PROVIDER === 'grok') {
      // const grok = new OpenAI({ apiKey: process.env.GROK_API_KEY, baseURL: 'https://api.x.ai/v1' });
      // Call Grok logic...
      aiSummary = { text: "AI integration announced", sentiment: "positive" };
    } else {
      // Default to OpenAI
      // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      // const completion = await openai.chat.completions.create({ ... });
      aiSummary = { text: `New AI integration for ${symbol}`, sentiment: "positive" };
    }

    if (aiSummary.sentiment === 'positive') sentimentColor = '#28a745';
    else if (aiSummary.sentiment === 'negative') sentimentColor = '#dc3545';
    else sentimentColor = '#f68410';

    // 3. Save to MongoDB
    const today = new Date().toISOString().split('T')[0];
    const newEvent = new Event({
      symbol: symbol.toUpperCase(),
      date: today,
      text: aiSummary.text,
      color: sentimentColor,
      textColor: '#ffffff',
      shape: aiSummary.sentiment === 'negative' ? 'arrowDown' : 'arrowUp',
      position: aiSummary.sentiment === 'negative' ? 'aboveBar' : 'belowBar',
      source: 'x.com'
    });

    await newEvent.save();

    res.status(200).json({ success: true, event: newEvent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
