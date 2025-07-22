#!/usr/bin/env node

// Mock Admin Server for MCP Testing
// Implements all Admin API endpoints used by MCP tools

import fastify from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const PORT = process.env.MOCK_ADMIN_PORT || 3333;
const HOST = process.env.MOCK_ADMIN_HOST || '0.0.0.0';

// Mock JWT secret (not validated, just decoded)
const MOCK_JWT_SECRET = 'mock-secret-for-testing-only';

// Mock data store
const mockData = {
  users: {
    'user123': {
      sub: 'user123',
      name: 'Test User',
      email: 'test@example.com',
      publishers: ['pub123', 'pub456']
    }
  },
  publishers: {
    'pub123': {
      id: 'pub123',
      name: "Test User's Team",
      owner: 'user123',
      applications: ['app123', 'app456']
    },
    'pub456': {
      id: 'pub456',
      name: "Another Team",
      owner: 'user123',
      applications: []
    }
  },
  applications: {
    'app123': {
      id: 'app123',
      name: 'Test Application',
      publisher_id: 'pub123',
      tos_uri: null,
      pp_uri: null,
      image_uri: null,
      dark_image_uri: null,
      device_code: false,
      web: {
        dev: {
          localhost: true,
          "127.0.0.1": true,
          wildcard_domain: false,
          redirect_uris: ['http://localhost:3000/callback']
        },
        prod: {
          redirect_uris: []
        }
      },
      createdBy: 'mcp'
    },
    'app456': {
      id: 'app456',
      name: 'Another App',
      publisher_id: 'pub123',
      tos_uri: 'https://example.com/tos',
      pp_uri: 'https://example.com/privacy',
      image_uri: 'https://example.com/logo.png',
      device_code: true,
      web: {
        dev: {
          localhost: true,
          "127.0.0.1": false,
          wildcard_domain: true,
          redirect_uris: ['http://localhost:8080/auth']
        },
        prod: {
          redirect_uris: ['https://myapp.com/callback']
        }
      }
    }
  }
};

// Create Fastify instance
const app = fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});

/**
 * Generate a mock JWT token
 * @param {Object} payload - JWT payload
 * @param {Object} options - Token options
 * @returns {string} - JWT token
 */
function generateMockToken(payload, options = {}) {
  const defaultPayload = {
    iss: 'https://issuer.hello.coop',
    aud: 'https://admin.hello.coop',
    scope: ['mcp'], // MCP server expects scope as array
    jti: crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (options.expiresIn || 3600), // 1 hour default
    ...payload
  };
  
  return jwt.sign(defaultPayload, MOCK_JWT_SECRET, { algorithm: 'HS256' });
}

/**
 * Validate JWT token (mock validation - doesn't verify signature)
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded payload or null if invalid
 */
function validateMockToken(token) {
  try {
    // Decode without verification for mock purposes
    const decoded = jwt.decode(token);
    
    if (!decoded) {
      return null;
    }
    
    // Check expiration
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return { expired: true, payload: decoded };
    }
    
    // Check required fields
    if (!decoded.sub || !decoded.scope || !Array.isArray(decoded.scope) || !decoded.scope.includes('mcp')) {
      return null;
    }
    
    return { valid: true, payload: decoded };
  } catch (error) {
    return null;
  }
}

/**
 * Creates a properly formatted WWW-Authenticate header (matching MCP server spec)
 * @param {Object} validationResult - Validation result with error details
 * @returns {string} - Formatted WWW-Authenticate header value
 */
function createWWWAuthenticateHeader(validationResult) {
  const realm = 'Hello Admin API';
  const resourceMetadata = `https://admin.hello.coop/.well-known/oauth-protected-resource`;
  
  let headerParts = [
    `realm="${realm}"`,
    `error="${validationResult.error}"`,
    `error_description="${validationResult.error_description}"`,
    `scope="mcp"`,
    `resource_metadata="${resourceMetadata}"`
  ];
  
  return `Bearer ${headerParts.join(', ')}`;
}

/**
 * Authentication middleware
 */
async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    const validationResult = {
      error: 'invalid_request',
      error_description: 'Authorization header required'
    };
    return reply.code(401)
      .header('WWW-Authenticate', createWWWAuthenticateHeader(validationResult))
      .send({
        error: validationResult.error,
        error_description: validationResult.error_description
      });
  }

  const bearerMatch = authHeader.match(/^bearer\s+(.+)$/i);
  if (!bearerMatch) {
    const validationResult = {
      error: 'invalid_request',
      error_description: 'Bearer token required'
    };
    return reply.code(401)
      .header('WWW-Authenticate', createWWWAuthenticateHeader(validationResult))
      .send({
        error: validationResult.error,
        error_description: validationResult.error_description
      });
  }
  
  const token = bearerMatch[1].trim();
  const validation = validateMockToken(token);
  
  if (!validation) {
    const validationResult = {
      error: 'invalid_token',
      error_description: 'Invalid token format'
    };
    return reply.code(401)
      .header('WWW-Authenticate', createWWWAuthenticateHeader(validationResult))
      .send({
        error: validationResult.error,
        error_description: validationResult.error_description
      });
  }
  
  if (validation.expired) {
    const validationResult = {
      error: 'invalid_token',
      error_description: 'Token has expired'
    };
    return reply.code(401)
      .header('WWW-Authenticate', createWWWAuthenticateHeader(validationResult))
      .send({
        error: validationResult.error,
        error_description: validationResult.error_description
      });
  }
  
  if (!validation.valid) {
    const validationResult = {
      error: 'insufficient_scope',
      error_description: 'Token does not have required scope'
    };
    return reply.code(403)
      .header('WWW-Authenticate', createWWWAuthenticateHeader(validationResult))
      .send({
        error: validationResult.error,
        error_description: validationResult.error_description
      });
  }
  
  // Add user info to request
  request.user = validation.payload;
  request.userId = validation.payload.sub;
}

// Add authentication hook for protected routes
app.addHook('preHandler', async (request, reply) => {
  // Skip auth for health and token endpoints
  if (request.url === '/health' || request.url === '/token' || request.url.startsWith('/token/')) {
    return;
  }
  
  // All other routes require authentication
  await authenticate(request, reply);
});

// Health check endpoint (no auth required)
app.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Token generation endpoints (for testing)
app.post('/token/valid', async (request, reply) => {
  const { sub = 'user123', expiresIn = 3600 } = request.body || {};
  const token = generateMockToken({ sub }, { expiresIn });
  return { access_token: token, token_type: 'Bearer', expires_in: expiresIn };
});

app.post('/token/expired', async (request, reply) => {
  const { sub = 'user123' } = request.body || {};
  const token = generateMockToken({ sub }, { expiresIn: -3600 }); // Expired 1 hour ago
  return { access_token: token, token_type: 'Bearer', expires_in: -3600 };
});

// Profile endpoints
app.get('/api/v1/profile', async (request, reply) => {
  const user = mockData.users[request.userId];
  if (!user) {
    return reply.code(404).send({ error: 'User not found' });
  }
  
  const publishers = user.publishers.map(pubId => mockData.publishers[pubId]).filter(Boolean);
  return {
    user: {
      sub: user.sub,
      name: user.name,
      email: user.email
    },
    publishers
  };
});

app.get('/api/v1/profile/:publisherId', async (request, reply) => {
  const { publisherId } = request.params;
  const publisher = mockData.publishers[publisherId];
  
  if (!publisher || publisher.owner !== request.userId) {
    return reply.code(404).send({ error: 'Publisher not found' });
  }
  
  const applications = publisher.applications.map(appId => mockData.applications[appId]).filter(Boolean);
  
  return {
    publisher: {
      ...publisher,
      applications
    }
  };
});

// Publisher endpoints
app.post('/api/v1/publishers', async (request, reply) => {
  const { name } = request.body;
  const publisherId = `pub${Date.now()}`;
  
  const newPublisher = {
    id: publisherId,
    name: name || `${mockData.users[request.userId]?.name || 'User'}'s Team`,
    owner: request.userId,
    applications: []
  };
  
  mockData.publishers[publisherId] = newPublisher;
  mockData.users[request.userId].publishers.push(publisherId);
  
  return newPublisher;
});

app.put('/api/v1/publishers/:publisherId', async (request, reply) => {
  const { publisherId } = request.params;
  const { name } = request.body;
  const publisher = mockData.publishers[publisherId];
  
  if (!publisher || publisher.owner !== request.userId) {
    return reply.code(404).send({ error: 'Publisher not found' });
  }
  
  publisher.name = name;
  return publisher;
});

app.get('/api/v1/publishers/:publisherId', async (request, reply) => {
  const { publisherId } = request.params;
  const publisher = mockData.publishers[publisherId];
  
  if (!publisher || publisher.owner !== request.userId) {
    return reply.code(404).send({ error: 'Publisher not found' });
  }
  
  const applications = publisher.applications.map(appId => mockData.applications[appId]).filter(Boolean);
  
  return {
    ...publisher,
    applications
  };
});

// Application endpoints
app.post('/api/v1/publishers/:publisherId/applications', async (request, reply) => {
  const { publisherId } = request.params;
  const publisher = mockData.publishers[publisherId];
  
  if (!publisher || publisher.owner !== request.userId) {
    return reply.code(404).send({ error: 'Publisher not found' });
  }
  
  const applicationId = `app${Date.now()}`;
  const newApplication = {
    id: applicationId,
    publisher_id: publisherId,
    name: request.body.name || `${mockData.users[request.userId]?.name || 'User'}'s MCP Created App`,
    tos_uri: request.body.tos_uri || null,
    pp_uri: request.body.pp_uri || null,
    image_uri: request.body.image_uri || null,
    dark_image_uri: request.body.dark_image_uri || null,
    device_code: request.body.device_code || false,
    web: request.body.web || {
      dev: {
        localhost: true,
        "127.0.0.1": true,
        wildcard_domain: false,
        redirect_uris: []
      },
      prod: {
        redirect_uris: []
      }
    },
    createdBy: request.body.createdBy || 'mcp'
  };
  
  mockData.applications[applicationId] = newApplication;
  publisher.applications.push(applicationId);
  
  return newApplication;
});

app.get('/api/v1/publishers/:publisherId/applications/:applicationId', async (request, reply) => {
  const { publisherId, applicationId } = request.params;
  const publisher = mockData.publishers[publisherId];
  const application = mockData.applications[applicationId];
  
  if (!publisher || publisher.owner !== request.userId) {
    return reply.code(404).send({ error: 'Publisher not found' });
  }
  
  if (!application || application.publisher_id !== publisherId) {
    return reply.code(404).send({ error: 'Application not found' });
  }
  
  return application;
});

app.put('/api/v1/publishers/:publisherId/applications/:applicationId', async (request, reply) => {
  const { publisherId, applicationId } = request.params;
  const publisher = mockData.publishers[publisherId];
  const application = mockData.applications[applicationId];
  
  if (!publisher || publisher.owner !== request.userId) {
    return reply.code(404).send({ error: 'Publisher not found' });
  }
  
  if (!application || application.publisher_id !== publisherId) {
    return reply.code(404).send({ error: 'Application not found' });
  }
  
  // Update application with new data
  Object.assign(application, request.body);
  application.id = applicationId; // Ensure ID doesn't change
  application.publisher_id = publisherId; // Ensure publisher_id doesn't change
  
  return application;
});

// Secrets endpoint
app.post('/api/v1/publishers/:publisherId/applications/:applicationId/secrets', async (request, reply) => {
  const { publisherId, applicationId } = request.params;
  const publisher = mockData.publishers[publisherId];
  const application = mockData.applications[applicationId];
  
  if (!publisher || publisher.owner !== request.userId) {
    return reply.code(404).send({ error: 'Publisher not found' });
  }
  
  if (!application || application.publisher_id !== publisherId) {
    return reply.code(404).send({ error: 'Application not found' });
  }
  
  const { hash, salt } = request.body;
  
  return {
    message: 'Secret created successfully',
    hash,
    salt,
    created_at: new Date().toISOString()
  };
});

// Logo upload endpoint
app.post('/api/v1/publishers/:publisherId/applications/:applicationId/logo', async (request, reply) => {
  const { publisherId, applicationId } = request.params;
  const publisher = mockData.publishers[publisherId];
  const application = mockData.applications[applicationId];
  
  if (!publisher || publisher.owner !== request.userId) {
    return reply.code(404).send({ error: 'Publisher not found' });
  }
  
  if (!application || application.publisher_id !== publisherId) {
    return reply.code(404).send({ error: 'Application not found' });
  }
  
  // Mock logo upload - just return a mock URL
  const logoUrl = `https://mock-cdn.hello.coop/logos/${applicationId}-${Date.now()}.png`;
  
  return {
    image_uri: logoUrl,
    message: 'Logo uploaded successfully'
  };
});

// Start server
async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`🚀 Mock Admin Server listening on http://${HOST}:${PORT}`);
    console.log(`📋 Health check: http://${HOST}:${PORT}/health`);
    console.log(`🔑 Generate valid token: POST http://${HOST}:${PORT}/token/valid`);
    console.log(`⏰ Generate expired token: POST http://${HOST}:${PORT}/token/expired`);
    console.log(`🔧 Set HELLO_ADMIN=http://${HOST}:${PORT} to use this mock server`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}, shutting down mock admin server...`);
  try {
    await app.close();
    console.log('✅ Mock Admin Server shut down successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

start();

// Export for testing
export { app, generateMockToken, validateMockToken, mockData }; 