// State management
const debugState = {
    domLoaded: false,
    xlsxLoaded: false,
    initCompleted: false,
    errors: [],
    logs: []
};

let isProcessing = false;
let excelData = [];
const pageLoadStart = performance.now();

// Debug functionality
function debugLog(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const log = `[${timestamp}] [${type}] ${message}`;
    debugState.logs.push(log);

    const debugOutput = document.getElementById('debugOutput');
    if (debugOutput) {
        debugOutput.textContent = debugState.logs.join('\n');
        debugOutput.scrollTop = debugOutput.scrollHeight;
    }

    console[type](message);
}

function getWorkerFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('worker');
}

// Form initialization
function initializeForm() {
    const endpoint = document.getElementById('apiEndpoint');

    const workerFromURL = getWorkerFromURL();
    if (workerFromURL) {
        endpoint.value = workerFromURL;
    }
    
    const testButton = document.getElementById('testEndpoint');
    const formContent = document.querySelector('.form-content');
    const submitButton = document.querySelector('button[type="submit"]');

    function updateFormState() {
        const hasEndpoint = endpoint.value.trim() !== '';
        testButton.disabled = !hasEndpoint;
        formContent.classList.toggle('disabled', !hasEndpoint);
        submitButton.disabled = !hasEndpoint;

        if (!hasEndpoint) {
            document.getElementById('currentEndpoint').textContent =
                'Please enter your Cloudflare Worker endpoint to begin';
        } else {
            document.getElementById('currentEndpoint').textContent =
                `Current endpoint: ${endpoint.value.trim()}`;
        }
    }

    async function testEndpoint() {
        const url = endpoint.value.trim();
        if (!url) return;

        testButton.disabled = true;
        testButton.textContent = 'Testing...';

        try {
            const response = await fetch(url, {
                method: 'OPTIONS'
            });

            if (response.ok) {
                updateEndpointStatus('Endpoint connection successful', 'success');
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            updateEndpointStatus(`Connection failed: ${error.message}`, 'danger');
        } finally {
            testButton.disabled = false;
            testButton.textContent = 'Test';
        }
    }

    endpoint.addEventListener('input', updateFormState);
    testButton.addEventListener('click', testEndpoint);
    updateFormState();
}

// Update endpoint status
function updateEndpointStatus(message, type = 'info') {
    const statusDiv = document.getElementById('endpointStatus');
    statusDiv.innerHTML = `<div class="alert alert-${type} mb-0 mt-2">${message}</div>`;
}

// Excel file handling
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    debugLog(`Processing file: ${file.name}`);
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            excelData = XLSX.utils.sheet_to_json(worksheet);

            debugLog(`Excel data loaded: ${excelData.length} rows`);
            showExcelInfo();

        } catch (error) {
            debugLog(`Excel processing error: ${error.message}`, 'error');
            showError('Error reading Excel file: ' + error.message);
        }
    };

    reader.onerror = () => {
        const error = 'Error reading file';
        debugLog(error, 'error');
        showError(error);
    };

    reader.readAsArrayBuffer(file);
}

function showExcelInfo() {
    const infoElement = document.getElementById('excelInfo');
    const summaryElement = infoElement.querySelector('.excel-summary');
    const previewElement = infoElement.querySelector('.excel-preview');
    const previewBody = previewElement.querySelector('tbody');

    summaryElement.textContent = `Loaded ${excelData.length} rows from Excel`;

    if (excelData.length > 0) {
        previewBody.innerHTML = '';
        excelData.slice(0, 5).forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.custom_id || 'N/A'}</td>
                <td>${row.user_message ? row.user_message.substring(0, 50) + '...' : 'N/A'}</td>
            `;
            previewBody.appendChild(tr);
        });
        previewElement.classList.remove('d-none');
    }

    infoElement.classList.remove('d-none');
}

// Form submission handling
async function handleFormSubmit(e) {
    e.preventDefault();
    if (isProcessing) return;

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    resetStatus();

    if (!excelData.length) {
        showError('Please upload an Excel file first');
        return;
    }

    const formData = getFormData();
    if (!validateFormData(formData)) return;

    try {
        debugLog('Starting batch submission...');
        setProcessing(true, submitBtn);
        const requests = createRequests(formData);
        debugLog(`Created ${requests.length} requests`);

        const response = await sendBatchRequest(formData, requests);
        const responseData = await response.json();
        debugLog('Batch submitted successfully', 'info');

        const processedData = {
            batch_id: responseData.id,
            status: responseData.processing_status,
            total_requests: Object.values(responseData.request_counts || {}).reduce((a, b) => a + b, 0),
            progress: responseData.request_counts ? (
                responseData.request_counts.succeeded / Object.values(responseData.request_counts).reduce((a, b) => a + b, 0)
            ) : 0,
            details: responseData
        };

        showStatus(processedData);
    } catch (error) {
        debugLog(`Batch submission error: ${error.message}`, 'error');
        handleError(error);
    } finally {
        setProcessing(false, submitBtn);
    }
}

// Batch results handling
async function fetchBatchResults(formData, batchId) {
    // Ensure batchId has the required prefix
    if (!batchId.startsWith('msgbatch_')) {
        throw new Error('Invalid batch ID format');
    }

    // Remove any trailing slashes from the endpoint
    const baseEndpoint = formData.apiEndpoint.replace(/\/+$/, '');
    const endpoint = `${baseEndpoint}/messages/batches/${batchId}/results`;

    try {
        debugLog(`Fetching results from: ${endpoint}`);
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'x-api-key': formData.apiKey,
                'anthropic-version': '2023-06-01'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error?.message || `HTTP ${response.status}`;
            } catch (e) {
                errorMessage = `HTTP ${response.status}: ${errorText}`;
            }
            throw new Error(errorMessage);
        }

        const results = await response.json();
        debugLog('Results fetched successfully', 'info');
        return results;
    } catch (error) {
        debugLog(`Error fetching results: ${error.message}`, 'error');
        throw error;
    }
}

function displayBatchResults(results) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsTableBody = document.getElementById('resultsTableBody');

    resultsTableBody.innerHTML = '';

    results.forEach(result => {
        const tr = document.createElement('tr');

        // Extract data from the JSONL structure
        const customId = result.custom_id;
        const resultType = result.result.type;
        let content = '';
        let errorMessage = '';

        if (resultType === 'succeeded') {
            content = result.result.message?.content[0]?.text || 'No content';
        } else {
            errorMessage = result.result.error?.message || 'Unknown error';
        }

        tr.innerHTML = `
            <td>${customId || 'N/A'}</td>
            <td>
                <span class="badge ${
            resultType === 'succeeded' ? 'bg-success' :
                resultType === 'errored' ? 'bg-danger' :
                    'bg-secondary'
        }">${resultType}</span>
            </td>
            <td>
                ${resultType === 'succeeded'
            ? `<div class="text-wrap">${content}</div>`
            : `<div class="text-danger">${errorMessage}</div>`
        }
            </td>
        `;
        resultsTableBody.appendChild(tr);
    });

    resultsSection.classList.remove('d-none');

    // Update CSV download handler to match JSONL structure
    document.getElementById('downloadResults').onclick = () => {
        const csvContent = [
            ['Custom ID', 'Status', 'Message Content', 'Error'],
            ...results.map(result => [
                result.custom_id,
                result.result.type,
                result.result.type === 'succeeded' ? result.result.message?.content[0]?.text : '',
                result.result.type === 'errored' ? result.result.error?.message : ''
            ])
        ].map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `batch-results-${new Date().toISOString()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
}

// Helper functions
function setProcessing(processing, submitBtn) {
    isProcessing = processing;
    submitBtn.disabled = processing;
    submitBtn.classList.toggle('loading', processing);
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('d-none');
}

function handleError(error) {
    showError(error.message);
    const submitBtn = document.querySelector('button[type="submit"]');
    setProcessing(false, submitBtn);
}

function resetStatus() {
    document.getElementById('error').classList.add('d-none');
    document.getElementById('status').classList.add('d-none');
    document.querySelector('.progress').classList.add('d-none');
    document.querySelector('.progress-bar').style.width = '0%';
    document.getElementById('resultsSection').classList.add('d-none');
}

function getFormData() {
    return {
        apiEndpoint: document.getElementById('apiEndpoint').value.trim(),
        apiKey: document.getElementById('apiKey').value,
        model: document.getElementById('model').value,
        maxTokens: parseInt(document.getElementById('maxTokens').value),
        systemPrompt: document.getElementById('systemPrompt').value.trim()
    };
}

function validateFormData(formData) {
    if (!formData.apiEndpoint) {
        showError('Please enter the Worker endpoint');
        return false;
    }
    if (!formData.apiKey) {
        showError('Please enter your API key');
        return false;
    }
    if (!formData.model) {
        showError('Please select a model');
        return false;
    }
    if (isNaN(formData.maxTokens) || formData.maxTokens < 1 || formData.maxTokens > 4096) {
        showError('Max tokens must be between 1 and 4096');
        return false;
    }
    return true;
}

function createRequests(formData) {
    return excelData.map(row => ({
        custom_id: row.custom_id?.toString() || generateCustomId(),
        params: {
            model: formData.model,
            max_tokens: formData.maxTokens,
            system: formData.systemPrompt ? [
                {
                    type: "text",
                    text: formData.systemPrompt,
                    cache_control: { type: "ephemeral" }
                }
            ] : undefined,
            messages: [{
                role: 'user',
                content: row.user_message
            }]
        }
    }));
}

function generateCustomId() {
    return 'req_' + Math.random().toString(36).substr(2, 9);
}

async function sendBatchRequest(formData, requests) {
    const endpoint = `${formData.apiEndpoint}/messages/batches`;

    const modifiedRequests = requests.map(request => {
        if (request.params.system) {
            request.params.system = request.params.system.map(sys => ({
                ...sys,
                cache_control: { type: "ephemeral" }
            }));
        }
        return request;
    });

    const requestBody = {
        requests: modifiedRequests
    };

    debugLog(`Sending request to: ${endpoint}`);
    debugLog('Request Headers:', 'debug');
    debugLog(JSON.stringify({
        'x-api-key': '********',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
    }, null, 2), 'debug');

    debugLog('Request Body:', 'debug');
    debugLog(JSON.stringify(requestBody, null, 2), 'debug');

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'x-api-key': formData.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    debugLog('Response Status:', 'debug');
    debugLog(`${response.status} ${response.statusText}`, 'debug');

    debugLog('Response Headers:', 'debug');
    debugLog(JSON.stringify(Object.fromEntries([...response.headers]), null, 2), 'debug');

    debugLog('Response Body:', 'debug');
    debugLog(responseText, 'debug');

    if (!response.ok) {
        let errorMessage;
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        } catch (e) {
            errorMessage = `HTTP ${response.status}: ${responseText}`;
        }
        throw new Error(errorMessage);
    }

    return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
    });
}

// Polling function for batch status
// Polling function for batch status
async function pollBatchStatus(formData, batchId, retryCount = 3) {
    // Remove any trailing slashes from the endpoint
    const baseEndpoint = formData.apiEndpoint.replace(/\/+$/, '');
    const endpoint = `${baseEndpoint}/messages/batches/${batchId}`;

    debugLog(`Polling endpoint: ${endpoint}`);
    debugLog(`Batch ID: ${batchId}`);
    debugLog(`API Key length: ${formData.apiKey.length}`);

    for (let i = 0; i < retryCount; i++) {
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'x-api-key': formData.apiKey,
                    'anthropic-version': '2023-06-01'
                }
            });

            const responseText = await response.text();
            debugLog('Poll Response Status:', 'debug');
            debugLog(`${response.status} ${response.statusText}`, 'debug');
            debugLog('Poll Response Headers:', 'debug');
            debugLog(JSON.stringify(Object.fromEntries([...response.headers]), null, 2), 'debug');
            debugLog('Poll Response Body:', 'debug');
            debugLog(responseText, 'debug');

            if (!response.ok) {
                let errorMessage;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.error?.message || `HTTP ${response.status}`;
                } catch (e) {
                    errorMessage = `HTTP ${response.status}: ${responseText}`;
                }
                throw new Error(errorMessage);
            }

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                debugLog('Raw response text:', 'debug');
                debugLog(responseText, 'debug');
                throw new Error(`Invalid JSON response: ${e.message}`);
            }

            return {
                batch_id: data.id,
                status: data.processing_status,
                total_requests: Object.values(data.request_counts || {}).reduce((a, b) => a + b, 0),
                progress: data.request_counts ? (
                    data.request_counts.succeeded / Object.values(data.request_counts).reduce((a, b) => a + b, 0)
                ) : 0,
                details: data
            };
        } catch (error) {
            debugLog(`Polling attempt ${i + 1} failed: ${error.message}`, 'error');
            if (i === retryCount - 1) {
                throw error;
            }
            // Exponential backoff with jitter
            const delay = Math.min(1000 * Math.pow(2, i) + Math.random() * 1000, 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Max retry attempts reached');
}

// Status display function
function showStatus(data) {
    const statusDiv = document.getElementById('status');
    const statusContent = document.getElementById('statusContent');
    const progressBar = statusDiv.querySelector('.progress-bar');
    const progress = statusDiv.querySelector('.progress');

    function updateStatusUI(batchData) {
        let statusClass = 'text-primary';
        let statusText = batchData.status;

        switch(batchData.status) {
            case 'in_progress':
                statusClass = 'text-primary';
                break;
            case 'ended':
                statusClass = 'text-success';
                statusText = 'Completed';
                break;
            case 'errored':
                statusClass = 'text-danger';
                break;
            case 'canceled':
                statusClass = 'text-warning';
                break;
            case 'expired':
                statusClass = 'text-secondary';
                break;
        }

        const successCount = batchData.details.request_counts.succeeded || 0;
        const totalCount = Object.values(batchData.details.request_counts).reduce((a, b) => a + b, 0);
        const progressPercent = totalCount > 0 ? (successCount / totalCount * 100).toFixed(1) : 0;

        statusContent.innerHTML = `
            <h5 class="mb-3">Batch Status</h5>
            <p>Batch ID: ${batchData.batch_id}</p>
            <p>Status: <span class="${statusClass}">${statusText}</span></p>
            <p>Total Requests: ${batchData.total_requests}</p>
            <div class="request-counts mt-3">
                <h6>Request Status:</h6>
                <ul class="list-unstyled">
                    <li>Processing: ${batchData.details.request_counts.processing || 0}</li>
                    <li>Succeeded: ${batchData.details.request_counts.succeeded || 0}</li>
                    <li>Errored: ${batchData.details.request_counts.errored || 0}</li>
                    <li>Canceled: ${batchData.details.request_counts.canceled || 0}</li>
                    <li>Expired: ${batchData.details.request_counts.expired || 0}</li>
                </ul>
            </div>
            <div class="mt-2">
                <small class="text-muted">Created: ${new Date(batchData.details.created_at).toLocaleString()}</small><br>
                <small class="text-muted">Expires: ${new Date(batchData.details.expires_at).toLocaleString()}</small>
            </div>
        `;

        progress.classList.remove('d-none');
        progressBar.style.width = `${progressPercent}%`;
        progressBar.setAttribute('aria-valuenow', progressPercent);
        progressBar.textContent = `${progressPercent}%`;
    }

    updateStatusUI(data);
    statusDiv.classList.remove('d-none');

    if (data.status === 'in_progress') {
        let pollCount = 0;
        const maxPolls = 60;
        const pollInterval = 10000;

        const formData = getFormData();

        // Validate batch ID format
        if (!data.batch_id?.startsWith('msgbatch_')) {
            debugLog('Invalid batch ID format', 'error');
            showError('Invalid batch ID format received from server');
            return;
        }

        const pollTimer = setInterval(async () => {
            try {
                pollCount++;
                if (pollCount > maxPolls) {
                    clearInterval(pollTimer);
                    debugLog('Polling stopped: maximum attempts reached', 'info');
                    return;
                }

                const updatedData = await pollBatchStatus(formData, data.batch_id);
                updateStatusUI(updatedData);

                if (updatedData.status !== 'in_progress') {
                    clearInterval(pollTimer);
                    debugLog(`Polling stopped: batch status is ${updatedData.status}`, 'info');

                    if (updatedData.status === 'ended') {
                        try {
                            // Add delay before fetching results
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            const results = await fetchBatchResults(formData, data.batch_id);
                            displayBatchResults(results);
                        } catch (error) {
                            debugLog(`Error displaying results: ${error.message}`, 'error');
                            showError('Error fetching batch results: ' + error.message);
                        }
                    }
                }
            } catch (error) {
                clearInterval(pollTimer);
                debugLog(`Polling stopped due to error: ${error.message}`, 'error');
                showError('Error updating batch status: ' + error.message);
            }
        }, pollInterval);
    }
}

// Initialize DOM event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize toggle buttons
    const toggleDebugButton = document.getElementById('toggleDebug');
    if (toggleDebugButton) {
        toggleDebugButton.addEventListener('click', () => {
            document.querySelector('.debug-panel').classList.toggle('show');
        });
    }

    const toggleApiKeyButton = document.getElementById('toggleApiKey');
    if (toggleApiKeyButton) {
        toggleApiKeyButton.addEventListener('click', (e) => {
            const input = document.getElementById('apiKey');
            const spans = e.currentTarget.getElementsByTagName('span');
            if (input.type === 'password') {
                input.type = 'text';
                spans[0].classList.remove('d-none');
                spans[1].classList.add('d-none');
            } else {
                input.type = 'password';
                spans[0].classList.add('d-none');
                spans[1].classList.remove('d-none');
            }
        });
    }

    // Initialize Excel file handler
    const excelFileInput = document.getElementById('excelFile');
    if (excelFileInput) {
        excelFileInput.addEventListener('change', handleFileUpload);
    }

    // Initialize form submit handler
    const batchForm = document.getElementById('batchForm');
    if (batchForm) {
        batchForm.addEventListener('submit', handleFormSubmit);
    }

    // Initialize form
    initializeForm();
    debugState.domLoaded = true;
    debugLog('DOM loaded, form initialized');

    if (typeof XLSX !== 'undefined') {
        debugState.xlsxLoaded = true;
        debugLog('XLSX library loaded successfully');
    } else {
        const error = 'XLSX library failed to load';
        debugState.errors.push(error);
        debugLog(error, 'error');
    }

    debugState.initCompleted = true;
    const loadTime = performance.now() - pageLoadStart;
    debugLog(`Initialization completed in ${loadTime}ms`);
});
