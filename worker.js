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
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    try {
      // Forward the request to Anthropic API
      const anthropicUrl = 'https://api.anthropic.com/v1/messages/batches';
      
      // Get the request body and headers
      const body = await request.text();
      const headers = new Headers({
        'Content-Type': 'application/json',
        'anthropic-version': request.headers.get('anthropic-version') || '2023-06-01',
        'x-api-key': request.headers.get('x-api-key'),
      });

      // Make the request to Anthropic
      const response = await fetch(anthropicUrl, {
        method: 'POST',
        headers: headers,
        body: body,
      });

      // Get the response data
      const data = await response.text();

      // Return the response with CORS headers
      return new Response(data, {
        status: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
          // Copy any other relevant headers from the Anthropic response
          ...Object.fromEntries(response.headers)
        },
      });

    } catch (error) {
      // Handle any errors
      return new Response(
        JSON.stringify({
          error: {
            type: 'worker_error',
            message: error.message
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