#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createGatewayMcpServer, HttpGatewayMcpBackend } from './server.js';

const apiKey = process.env.GATEWAY_API_KEY;
if (!apiKey) throw new Error('GATEWAY_API_KEY is required');

const server = createGatewayMcpServer(new HttpGatewayMcpBackend({
  apiKey,
  baseUrl: process.env.GATEWAY_API_URL,
}));

await server.connect(new StdioServerTransport());

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});
