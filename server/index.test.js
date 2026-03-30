const request = require('supertest');
const app = require('./app');

describe('Intelligence Suite Backend API', () => {
  test('GET / should return system status', async () => {
    const response = await request(app).get('/');
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('status', 'operational');
    expect(response.body).toHaveProperty('service', 'Intelligence Suite Backend');
  });

  test('POST /api/chat should return error if API key is missing', async () => {
    // temporarily unset env var for test if needed, 
    // but the app already checks for it.
    const response = await request(app)
      .post('/api/chat')
      .send({
        model: 'togcode-ai-3-pro',
        messages: [{ role: 'user', content: 'test' }]
      });
    
    // If API_KEY is missing, it returns 500
    if (!process.env.CEREBRAS_API_KEY) {
      expect(response.statusCode).toBe(500);
      expect(response.body.error).toHaveProperty('message', 'Backend configuration error: API Key missing');
    }
  });

  test('POST /api/chat should handle invalid model gracefully', async () => {
    const response = await request(app)
      .post('/api/chat')
      .send({
        model: 'invalid-model',
        messages: [{ role: 'user', content: 'test' }]
      });
    
    // It should fall back to a default model or return 500 if key missing
    if (!process.env.CEREBRAS_API_KEY) {
      expect(response.statusCode).toBe(500);
    }
  });
});
