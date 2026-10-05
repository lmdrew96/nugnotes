import { httpRouter } from 'convex/server';
import { mcpGetCourses, mcpGetSession, mcpListSessions, mcpSearchSessions } from './mcpApi';

/**
 * Public HTTP routes. Only the MCP API lives here, and it authenticates every
 * request with a per-user API key. Everything that spends AI credits (chat,
 * generation, document parsing) or posts publicly (bug reports) is a Convex
 * action instead, so it runs as the signed-in user and is rate-limited.
 */
const http = httpRouter();

// MCP API routes (API-key authenticated — no CORS needed, server-to-server)
http.route({ path: '/mcp/sessions', method: 'GET', handler: mcpListSessions });
http.route({ path: '/mcp/session', method: 'GET', handler: mcpGetSession });
http.route({ path: '/mcp/sessions/search', method: 'GET', handler: mcpSearchSessions });
http.route({ path: '/mcp/courses', method: 'GET', handler: mcpGetCourses });

export default http;
