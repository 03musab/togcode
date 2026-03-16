const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Intelligence Hub System Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'operational',
    service: 'Intelligence Hub Backend',
    version: 'Togcode 120B',
    timestamp: new Date().toISOString()
  });
});

// AI Proxy Endpoint with Tiered Response Times
app.post('/api/chat', async (req, res) => {
  const { messages, model, temperature, max_tokens } = req.body;
  
  // Model Tier Logic
  const modelTiers = {
    'gpt-oss-120b': { cerebras: 'llama3.1-70b', delay: 0 },
    'togcode-3-lite': { cerebras: 'llama3.1-8b', delay: 1000 },
    'togcode-2-legacy': { cerebras: 'llama3.1-8b', delay: 2500 }
  };

  const selectedTier = modelTiers[model] || modelTiers['gpt-oss-120b'];
  const cerebrasModel = selectedTier.cerebras;
  const artificialDelay = selectedTier.delay;

  const API_KEY = process.env.CEREBRAS_API_KEY;
  if (!API_KEY) {
    console.error('❌ CRITICAL ERROR: CEREBRAS_API_KEY is missing in .env');
    return res.status(500).json({ error: 'Backend configuration error: API Key missing' });
  }

  try {
    // Simulate Tiered Performance for non-Pro models
    if (artificialDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, artificialDelay));
    }

    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: cerebrasModel,
        messages,
        temperature: temperature || 0.6,
        max_tokens: max_tokens || 1500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Cerebras API Error:', errorData);
      return res.status(response.status).json({ 
        error: errorData.error?.message || response.statusText 
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('AI Proxy Error:', error);
    res.status(500).json({ error: 'Failed to communicate with Intelligence Engine (Cerebras)' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Intelligence Hub Backend running on http://localhost:${PORT}`);
});
