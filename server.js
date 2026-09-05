/**
 * Mock API Server for Kaarya Mobile App
 * Run with: node server.js
 */

const http = require('http');

// In-memory "database"
const users = new Map();
const tokens = new Map();

let userIdCounter = 3; // Start after our seed users

// Pre-seeded dummy users
users.set('9800000001', {
  id: 1,
  phone: '9800000001',
  name: 'Rajesh Kumar',
  role: 'provider',
  password: 'test123',
  avatar: null,
  rating: 4.8,
  createdAt: new Date().toISOString(),
});

users.set('9800000002', {
  id: 2,
  phone: '9800000002',
  name: 'Sita Sharma',
  role: 'seeker',
  password: 'test123',
  avatar: null,
  rating: 4.5,
  createdAt: new Date().toISOString(),
});

function generateToken() {
  return 'mock_token_' + Math.random().toString(36).substring(2, 15);
}

function generateUserId() {
  return userIdCounter++;
}

function createMockUser(data) {
  const user = {
    id: generateUserId(),
    phone: data.phone,
    name: data.name,
    role: data.role,
    avatar: null,
    rating: 4.5,
    createdAt: new Date().toISOString(),
  };
  users.set(data.phone, { ...user, password: data.password });
  return user;
}

function getMockUser(phone) {
  return users.get(phone);
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost:5000');
  const path = url.pathname;
  const method = req.method;

  // Collect request body
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let response;
    const jsonHeaders = { 'Content-Type': 'application/json' };

    try {
      // Route: POST /api/auth/login
      if (path === '/api/auth/login' && method === 'POST') {
        const { phone, password } = JSON.parse(body || '{}');
        const user = getMockUser(phone);

        if (!user || user.password !== password) {
          response = { message: 'Invalid phone or password' };
          res.writeHead(401, jsonHeaders);
        } else {
          const token = generateToken();
          tokens.set(token, user.id);
          response = {
            token,
            user: { id: user.id, phone: user.phone, name: user.name, role: user.role, avatar: user.avatar, rating: user.rating }
          };
          res.writeHead(200, jsonHeaders);
        }
      }
      // Route: POST /api/auth/register
      else if (path === '/api/auth/register' && method === 'POST') {
        const data = JSON.parse(body || '{}');

        if (!data.phone || !data.password || !data.name || !data.role) {
          response = { message: 'Missing required fields: phone, password, name, role' };
          res.writeHead(400, jsonHeaders);
        } else if (getMockUser(data.phone)) {
          response = { message: 'Phone number already registered' };
          res.writeHead(409, jsonHeaders);
        } else {
          const user = createMockUser(data);
          const token = generateToken();
          tokens.set(token, user.id);
          response = {
            token,
            user: { id: user.id, phone: user.phone, name: user.name, role: user.role, avatar: user.avatar, rating: user.rating }
          };
          res.writeHead(201, jsonHeaders);
        }
      }
      // Route: GET /api/auth/me
      else if (path === '/api/auth/me' && method === 'GET') {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token || !tokens.has(token)) {
          response = { message: 'Unauthorized' };
          res.writeHead(401, jsonHeaders);
        } else {
          const userId = tokens.get(token);
          const user = Array.from(users.values()).find(u => u.id === userId);
          if (user) {
            response = { id: user.id, phone: user.phone, name: user.name, role: user.role, avatar: user.avatar, rating: user.rating };
            res.writeHead(200, jsonHeaders);
          } else {
            response = { message: 'User not found' };
            res.writeHead(404, jsonHeaders);
          }
        }
      }
      // Route: POST /api/auth/logout
      else if (path === '/api/auth/logout' && method === 'POST') {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');
        if (token) tokens.delete(token);
        response = { message: 'Logged out successfully' };
        res.writeHead(200, jsonHeaders);
      }
      // 404 for unknown routes
      else {
        response = { message: 'Not found' };
        res.writeHead(404, jsonHeaders);
      }
    } catch (err) {
      response = { message: 'Invalid JSON' };
      res.writeHead(400, jsonHeaders);
    }

    res.end(JSON.stringify(response));
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                  🚀 Kaarya Mock Server Running                ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║   Server:    http://localhost:${PORT}                          ║
║   API Base:  http://localhost:${PORT}/api                      ║
║                                                              ║
║   Endpoints:                                                ║
║   • POST /api/auth/login    - Login with phone + password    ║
║   • POST /api/auth/register - Register new user              ║
║   • GET  /api/auth/me      - Get current user info           ║
║   • POST /api/auth/logout  - Logout                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

Test credentials (after registering):
  Phone:    9800000000
  Password: test123
`);
});
