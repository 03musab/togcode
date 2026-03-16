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
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// AI Proxy Endpoint
app.post('/api/chat', async (req, res) => {
  const { messages, model, temperature, max_tokens } = req.body;
  
  // Use environment variable for security
  const API_KEY = process.env.CEREBRAS_API_KEY || 'csk-yjmhny5wcyh5dmt4wf9f5mp3k6w4cvkerw2vrh4ceyxh46vr';

  try {
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: model || 'llama3.1-8b',
        messages,
        temperature: temperature || 0.6,
        max_tokens: max_tokens || 1500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('AI Proxy Error:', error);
    res.status(500).json({ error: 'Failed to communicate with AI provider' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Intelligence Hub Backend running on http://localhost:${PORT}`);
});
