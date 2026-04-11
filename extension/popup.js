document.addEventListener('DOMContentLoaded', () => {
    const manualUrlInput = document.getElementById('manualUrlInput');
    const scanPastedBtn = document.getElementById('scanPastedBtn');
    const scanTabBtn = document.getElementById('scanTabBtn');
    
    const targetUrlEl = document.getElementById('targetUrl');
    const loadingState = document.getElementById('loadingState');
    const resultState = document.getElementById('resultState');
    const verdictBanner = document.getElementById('verdictBanner');
    const verdictText = document.getElementById('verdictText');
    const riskScore = document.getElementById('riskScore');
    const confidenceScore = document.getElementById('confidenceScore');
    const reasonsContainer = document.getElementById('reasonsContainer');
    const latencyDisplay = document.getElementById('latencyDisplay');
    const resolvedUrlSection = document.getElementById('resolvedUrlSection');
    const resolvedUrlEl = document.getElementById('resolvedUrl');

    // Automatically focus the input field on open
    manualUrlInput.focus();

    // 1. Scan Pasted Link
    scanPastedBtn.addEventListener('click', () => {
        let url = manualUrlInput.value.trim();
        if (!url) return;
        
        // Auto-prepend http if missing for valid parsing by backend
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }
        
        analyzeUrl(url);
    });

    // Handle Enter key for fast scanning
    manualUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            scanPastedBtn.click();
        }
    });

    // 2. Extract Current Tab URL
    scanTabBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && !tab.url.startsWith('chrome://')) {
                manualUrlInput.value = tab.url;
            } else {
                manualUrlInput.value = "Cannot scan this internal page";
            }
        } catch (err) {
            console.error("Tab query failed:", err);
        }
    });

    // 3. Call local ThreatLens API
    async function analyzeUrl(url) {
        // Reset UI
        resultState.classList.add('hidden');
        loadingState.classList.remove('hidden');
        targetUrlEl.textContent = url;
        
        if (resolvedUrlSection) resolvedUrlSection.classList.add('hidden');

        try {
            const response = await fetch('http://localhost:8001/predict/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ urls: [url] })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (Array.isArray(data) && data.length > 0) {
                showResult(data[0]);
            } else {
                throw new Error('Invalid response format');
            }

        } catch (err) {
            console.error("Analysis Error:", err);
            showResult({
                verdict: 'error',
                risk_score: 0.0,
                reasons: [`Connection failed: Ensure ThreatLens backend is running on port 8001. Raw error: ${err.message}`],
                latency_ms: 0
            });
        }
    }

    // 3. Display Results
    function showResult(result) {
        // Hide loading, show results
        loadingState.classList.add('hidden');
        resultState.classList.remove('hidden');

        // Apply classes based on verdict
        const v = result.verdict.toLowerCase();
        
        verdictBanner.classList.remove('is-safe', 'is-suspicious', 'is-phishing');
        
        if (v === 'safe') {
            verdictBanner.classList.add('is-safe');
            verdictText.textContent = 'SAFE';
            riskScore.style.color = 'var(--safe)';
        } else if (v === 'suspicious') {
            verdictBanner.classList.add('is-suspicious');
            verdictText.textContent = 'SUSPICIOUS';
            riskScore.style.color = 'var(--suspicious)';
        } else if (v === 'phishing') {
            verdictBanner.classList.add('is-phishing');
            verdictText.textContent = 'PHISHING';
            riskScore.style.color = 'var(--phishing)';
            // Make pulse indicator red for danger
            document.querySelector('.pulse-indicator').style.backgroundColor = 'var(--phishing)';
            document.querySelector('.pulse-indicator').style.animation = 'none';
        } else {
            verdictBanner.classList.add('is-suspicious');
            verdictText.textContent = 'ERROR';
            riskScore.style.color = 'var(--text-dim)';
        }

        riskScore.textContent = result.risk_score.toFixed(1);
        
        // Handle Confidence
        if (result.confidence) {
            confidenceScore.textContent = result.confidence;
            if (result.confidence === 'high') {
                confidenceScore.style.color = '#e2e8f0';
            } else if (result.confidence === 'medium') {
                confidenceScore.style.color = 'var(--suspicious)';
            } else {
                confidenceScore.style.color = 'var(--text-dim)';
            }
        } else {
            confidenceScore.textContent = 'N/A';
        }

        // Handle Resolved URL
        if (result.resolved_url) {
            resolvedUrlSection.classList.remove('hidden');
            resolvedUrlEl.textContent = result.resolved_url;
        } else {
            resolvedUrlSection.classList.add('hidden');
        }

        // Populate reasons
        reasonsContainer.innerHTML = '';
        if (result.reasons && result.reasons.length > 0) {
            result.reasons.forEach(reason => {
                const div = document.createElement('div');
                div.className = 'reason-item';
                div.textContent = reason;
                reasonsContainer.appendChild(div);
            });
        }

        // Handle Reachability Display Separately
        const reachabilityBanner = document.getElementById('reachabilityBanner');
        if (result.reachability === 'unreachable') {
            reachabilityBanner.classList.remove('hidden');
        } else {
            reachabilityBanner.classList.add('hidden');
        }

        if (result.latency_ms > 0) {
            latencyDisplay.textContent = `Analyzed in ${result.latency_ms}ms`;
        }
    }
});
