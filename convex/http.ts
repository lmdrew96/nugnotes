import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { examNuggetChat } from './examChat';
import { mcpGetCourses, mcpGetSession, mcpListSessions, mcpSearchSessions } from './mcpApi';
import { nuggetChat } from './nuggetChat';
import { reportBug } from './reportBug';

const http = httpRouter();

// CORS preflight handler
const corsHandler = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
});

// Nugget Chat (Q&A about content)
http.route({
  path: '/nuggetChat',
  method: 'OPTIONS',
  handler: corsHandler,
});

http.route({
  path: '/nuggetChat',
  method: 'POST',
  handler: nuggetChat,
});

// Bug Report (creates GitHub Issue)
http.route({
  path: '/reportBug',
  method: 'OPTIONS',
  handler: corsHandler,
});

http.route({
  path: '/reportBug',
  method: 'POST',
  handler: reportBug,
});

// Exam Nugget Chat (multi-session AI chat in exam rooms)
http.route({
  path: '/examNuggetChat',
  method: 'OPTIONS',
  handler: corsHandler,
});

http.route({
  path: '/examNuggetChat',
  method: 'POST',
  handler: examNuggetChat,
});

// MCP API routes (API-key authenticated — no CORS needed, server-to-server)
http.route({ path: '/mcp/sessions', method: 'GET', handler: mcpListSessions });
http.route({ path: '/mcp/session', method: 'GET', handler: mcpGetSession });
http.route({ path: '/mcp/sessions/search', method: 'GET', handler: mcpSearchSessions });
http.route({ path: '/mcp/courses', method: 'GET', handler: mcpGetCourses });

export default http;
