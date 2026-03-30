const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Intelligence Suite System Status
app.get('/', (req, res) => {
  res.json({
    status: 'operational',
    service: 'Intelligence Suite Backend',
    version: 'Togcode AI / Standard Intelligence',
    engine: 'Cerebras llama3.1-8b',
    timestamp: new Date().toISOString()
  });
});

// AI Proxy Endpoint with Tiered Response Times
app.post('/api/chat', async (req, res, next) => {
  const { messages, model, temperature, max_tokens } = req.body;

  // Model Tier Logic
  const modelTiers = {
    'togcode-ai-3-lite':  { cerebras: 'llama3.1-8b', delay: 1000 },
    'togcode-ai-2-legacy': { cerebras: 'llama3.1-8b', delay: 2500 },
  };

  const selectedTier = modelTiers[model] || modelTiers['togcode-ai-3-lite'];
  const cerebrasModel = selectedTier.cerebras;
  const artificialDelay = selectedTier.delay;

  const API_KEY = process.env.CEREBRAS_API_KEY;
  if (!API_KEY) {
    const err = new Error('Backend configuration error: API Key missing');
    err.status = 500;
    return next(err);
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
    next(error); // Pass to centralized error handler
  }
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred in the Intelligence Suite';

  console.error(`[${new Date().toISOString()}] ❌ ERROR: ${message}`);
  if (err.stack && process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: {
      message,
      status: statusCode,
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = app;
