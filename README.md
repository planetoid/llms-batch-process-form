# Claude API Batch Processing

A web application for batch processing requests to the Anthropic Claude API. This tool allows you to upload Excel files containing multiple prompts and process them in batch through Claude, making it efficient to handle large numbers of AI requests.

## Features

- Upload Excel files containing prompts for batch processing
- Support for all Claude 3 models (Opus, Sonnet, Haiku)
- Real-time batch status monitoring
- Progress tracking with detailed request counts
- Results viewing and CSV export
- Debug panel for troubleshooting
- Customizable system prompts
- Configurable max tokens

## Components

The application consists of three main components:

1. **Frontend (index.html, index.js)**
    - User interface for file upload and batch management
    - Real-time status updates and progress tracking
    - Results display and export functionality

2. **Cloudflare Worker (worker.js)**
    - Handles API requests to Anthropic
    - Manages CORS and request routing
    - Error handling and response processing

## Setup

### Prerequisites

- A Cloudflare account with Workers enabled
- An Anthropic API key
- Node.js and npm (for local development)

### Installation

1. Deploy the Cloudflare Worker:
   ```bash
   # Install Wrangler CLI if you haven't already
   npm install -g wrangler
   
   # Login to Cloudflare
   wrangler login
   
   # Deploy the worker
   wrangler deploy
   ```

2. Host the frontend files (index.html and index.js) on your preferred hosting service or run locally.

3. Note your Worker URL - you'll need this when using the application.

## Usage

1. Open the web application in your browser.

2. Enter your Cloudflare Worker endpoint URL and test the connection.

3. Enter your Anthropic API key.

4. Configure batch processing settings:
    - Select Claude model version
    - Set maximum tokens
    - (Optional) Add system prompt

5. Prepare your Excel file with the following columns:
    - `custom_id`: Unique identifier for each request
    - `user_message`: The prompt/message to send to Claude

6. Upload your Excel file and submit the batch.

7. Monitor progress and download results when complete.

## Excel File Format

Your Excel file should follow this format:

| custom_id | user_message |
|-----------|--------------|
| id_1      | What is the capital of France? |
| id_2      | Explain quantum computing. |

- The `custom_id` column is optional (IDs will be generated if not provided)
- The `user_message` column is required
- Maximum 100,000 requests per batch
- Maximum file size: 256 MB

## Limitations

- Maximum 4096 tokens per response
- Batch processing timeout: 24 hours
- Rate limits apply based on your Anthropic API tier
- File size limit: 256 MB

## Troubleshooting

1. **Connection Issues**
    - Verify your Worker endpoint URL
    - Ensure your API key is valid
    - Check CORS settings in the Worker

2. **File Upload Issues**
    - Verify Excel file format
    - Check file size (max 256 MB)
    - Ensure required columns are present

3. **Processing Issues**
    - Use the debug panel to view detailed logs
    - Check batch status for error messages
    - Verify token limits and request formatting

## Security Considerations

- API keys are only stored in memory during processing
- No data is permanently stored on servers
- All communication is encrypted via HTTPS
- Worker implements basic request validation

## Development

To run locally:

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

To modify the Worker:

1. Edit `worker.js`
2. Test locally using Wrangler:
   ```bash
   wrangler dev
   ```
3. Deploy changes:
   ```bash
   wrangler deploy
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.