const CALLS_BASE = '/calls';
const SETUP_BASE = '/setup';
async function startSetup() {
    const response = await fetch(`${SETUP_BASE}/start`, { method: 'POST' });
    if (!response.ok)
        throw new Error('Failed to start setup');
    return response.json();
}
async function sendSetupMessage(sessionId, message) {
    const response = await fetch(`${SETUP_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
    });
    if (!response.ok)
        throw new Error('Failed to send setup message');
    return response.json();
}
async function startCall(context) {
    const response = await fetch(`${CALLS_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
    });
    if (!response.ok)
        throw new Error('Failed to start call');
    return response.json();
}
async function endCall(callId, conversationId) {
    const response = await fetch(`${CALLS_BASE}/${callId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
    });
    if (!response.ok)
        throw new Error('Failed to end call');
    return response.json();
}
async function getCall(callId) {
    const response = await fetch(`${CALLS_BASE}/${callId}`);
    if (!response.ok)
        throw new Error('Failed to get call');
    return response.json();
}
export { startCall, endCall, getCall, startSetup, sendSetupMessage };
