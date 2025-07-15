document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const keyStatus = document.getElementById('keyStatus');
    const setKeyBtn = document.getElementById('setKey');
    const viewKeyBtn = document.getElementById('viewKey');
    const removeKeyBtn = document.getElementById('removeKey');
    const keyEntrySection = document.getElementById('keyEntry');
    const newApiKeyInput = document.getElementById('newApiKey');
    const saveKeyBtn = document.getElementById('saveKey');
    const cancelKeyBtn = document.getElementById('cancelKey');
    const testApiBtn = document.getElementById('testApi');
    
    // State
    let storedKey = '';
    let isKeySet = false;
    let isTesting = false;

    // Load saved key status with enhanced error handling
    chrome.storage.local.get(['apiKey', 'usageStats'], (data) => {
        try {
            if (data.apiKey) {
                storedKey = data.apiKey;
                isKeySet = true;
                updateKeyStatus('API key is securely stored', 'green');
            }
            
            if (data.usageStats) {
                updateUsageStats(data.usageStats);
            }
        } catch (error) {
            console.error('Error loading storage:', error);
            showStatus("Error loading settings", "error");
        }
    });

    // Event listeners with debouncing
    setKeyBtn.addEventListener('click', debounce(() => {
        keyEntrySection.style.display = 'block';
        newApiKeyInput.value = '';
        newApiKeyInput.focus();
    }, 200));

    viewKeyBtn.addEventListener('click', debounce(() => {
        if (!storedKey) {
            showStatus("No API key stored", "error");
            return;
        }
        showStatus(`API Key: ${maskKey(storedKey)}`, "info");
    }, 200));

    removeKeyBtn.addEventListener('click', debounce(() => {
        if (!storedKey) {
            showStatus("No API key to remove", "error");
            return;
        }
        
        if (confirm("Are you sure you want to remove the API key?")) {
            chrome.storage.local.remove('apiKey', () => {
                storedKey = '';
                isKeySet = false;
                updateKeyStatus('API key removed', 'red');
                showStatus("API Key removed successfully!", "success");
                resetUsageStats();
            });
        }
    }, 200));

    saveKeyBtn.addEventListener('click', debounce(() => {
        const newKey = sanitizeInput(newApiKeyInput.value.trim());
        
        if (!validateKeyFormat(newKey)) {
            showStatus("Please enter a valid 39-character API key", "error");
            return;
        }
        
        storedKey = newKey;
        isKeySet = true;
        
        chrome.storage.local.set({ 
            apiKey: newKey,
            usageStats: { today: 0, month: 0, lastReset: new Date().toISOString() } 
        }, () => {
            keyEntrySection.style.display = 'none';
            updateKeyStatus('API key is securely stored', 'green');
            showStatus("API Key saved securely!", "success");
        });
    }, 200));

    cancelKeyBtn.addEventListener('click', debounce(() => {
        keyEntrySection.style.display = 'none';
    }, 200));

    testApiBtn.addEventListener('click', debounce(testApiConnection, 500));

    // Helper functions
    function updateKeyStatus(text, color) {
        keyStatus.textContent = text;
        keyStatus.style.color = color;
    }

    function updateUsageStats(stats) {
        document.getElementById('dailyCount').textContent = stats.today || 0;
        document.getElementById('monthlyCount').textContent = stats.month || 0;
        
        // Auto-reset monthly stats if new month
        const lastReset = new Date(stats.lastReset || 0);
        const now = new Date();
        if (lastReset.getMonth() !== now.getMonth() || 
            lastReset.getFullYear() !== now.getFullYear()) {
            resetUsageStats();
        }
    }

    function resetUsageStats() {
        const newStats = { today: 0, month: 0, lastReset: new Date().toISOString() };
        chrome.storage.local.set({ usageStats: newStats }, () => {
            updateUsageStats(newStats);
        });
    }

    function maskKey(key) {
        return key.substring(0, 4) + '••••••' + key.slice(-4);
    }

    function sanitizeInput(input) {
        return input.replace(/[^a-zA-Z0-9_-]/g, '');
    }

    function validateKeyFormat(key) {
        return key.length === 39 && /^[a-zA-Z0-9_-]+$/.test(key);
    }

    function debounce(func, delay) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }
});

async function testApiConnection() {
    if (isTesting) return;
    isTesting = true;
    
    const status = document.getElementById('status');
    status.textContent = "Testing Gemini connection...";
    status.className = "status-info";
    
    try {
        const data = await new Promise(resolve => 
            chrome.storage.local.get(['apiKey', 'usageStats'], resolve)
        );
        
        if (!data.apiKey) {
            throw new Error("No API key saved");
        }
        
        const isValid = await validateGeminiKey(data.apiKey);
        
        if (isValid) {
            showStatus("✅ Gemini connection successful!", "success");
            updateUsageCounter(data.usageStats);
        } else {
            showStatus("❌ Invalid Gemini API key", "error");
        }
    } catch (error) {
        showStatus(`⚠️ Error: ${error.message}`, "error");
    } finally {
        isTesting = false;
    }
}

async function validateGeminiKey(key) {
    try {
        const testEndpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`;
        const response = await fetch(testEndpoint, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "X-Client-Type": "ChromeExtension/1.0" 
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: "Hello" }]
                }],
                safetySettings: [{
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_NONE"
                }]
            }),
            timeout: 5000 // Simulated timeout
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('API Error:', errorData);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Validation error:', error);
        return false;
    }
}

function updateUsageCounter(stats) {
    const today = new Date().toISOString().split('T')[0];
    const newStats = {
        today: (stats?.today || 0) + 1,
        month: (stats?.month || 0) + 1,
        lastUsed: today,
        lastReset: stats?.lastReset || new Date().toISOString()
    };
    
    chrome.storage.local.set({ usageStats: newStats }, () => {
        document.getElementById('dailyCount').textContent = newStats.today;
        document.getElementById('monthlyCount').textContent = newStats.month;
    });
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status-${type}`;
    
    // Clear previous timeout if exists
    if (status.timeoutId) clearTimeout(status.timeoutId);
    
    status.timeoutId = setTimeout(() => {
        status.textContent = "";
        status.className = "";
        status.timeoutId = null;
    }, 3000);
}