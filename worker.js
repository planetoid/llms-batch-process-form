/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow GET and POST requests
    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    try {
      const url = new URL(request.url);
      const pathSegments = url.pathname.split('/').filter(segment => segment);

      console.log('Path segments:', pathSegments);
      console.log('Request URL:', url.toString());

      // Basic validation
      const apiKey = request.headers.get('x-api-key');
      if (!apiKey) {
        throw new Error('Missing API key');
      }

      // Determine if this is a results endpoint request
      const isResultsEndpoint = pathSegments.length > 3 && pathSegments[3] === 'results';

      // Construct the Anthropic API URL
      let anthropicUrl = 'https://api.anthropic.com/v1/messages/batches';

      if (pathSegments.length >= 2 && pathSegments[0] === 'messages' && pathSegments[1] === 'batches') {
        if (pathSegments.length > 2) {
          const batchId = pathSegments[2];
          if (!batchId.startsWith('msgbatch_')) {
            throw new Error('Message Batch id must have `msgbatch_` prefix.');
          }

          if (isResultsEndpoint) {
            anthropicUrl = `https://api.anthropic.com/v1/messages/batches/${batchId}/results`;
          } else {
            anthropicUrl = `https://api.anthropic.com/v1/messages/batches/${batchId}`;
          }
        }
      }

      console.log('Requesting Anthropic URL:', anthropicUrl);

      const response = await fetch(anthropicUrl, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': request.headers.get('anthropic-version') || '2023-06-01',
          'x-api-key': apiKey,
        },
        body: request.method === 'POST' ? await request.text() : undefined,
      });

      const responseData = await response.text();

      console.log('Response status:', response.status);
      console.log('Raw response data:', responseData);

      let parsedData;

      if (isResultsEndpoint) {
        // Handle JSONL format for results endpoint
        try {
          const lines = responseData.split('\n').filter(line => line.trim());
          console.log('Number of JSONL lines:', lines.length);

          parsedData = [];
          for (let i = 0; i < lines.length; i++) {
            try {
              const lineData = JSON.parse(lines[i]);
              parsedData.push(lineData);
              console.log(`Successfully parsed line ${i + 1}`);
            } catch (e) {
              console.error(`Error parsing line ${i + 1}:`, e);
              console.error('Problematic line:', lines[i]);
            }
          }

          if (parsedData.length === 0) {
            throw new Error('No valid JSON lines found in results response');
          }

          console.log('Successfully parsed', parsedData.length, 'results');
        } catch (e) {
          console.error('JSONL parsing error:', e);
          throw new Error(`Failed to parse JSONL response: ${e.message}`);
        }
      } else {
        // Handle regular JSON for other endpoints
        try {
          parsedData = JSON.parse(responseData);
        } catch (e) {
          console.error('JSON parsing error:', e);
          throw new Error(`Failed to parse JSON response: ${e.message}`);
        }
      }

      return new Response(JSON.stringify(parsedData), {
        status: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      });

    } catch (error) {
      console.error('Worker error:', error);

      return new Response(
          JSON.stringify({
            error: {
              type: 'worker_error',
              message: error.message,
              stack: error.stack,
              details: error.cause ? String(error.cause) : undefined
            }
          }),
          {
            status: 500,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json',
            },
          }
      );
    }
  },
};