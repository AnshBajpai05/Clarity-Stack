document.addEventListener('DOMContentLoaded', () => {
    const manualUrlInput = document.getElementById('manualUrlInput');
    const scanPastedBtn  = document.getElementById('scanPastedBtn');
    const scanTabBtn     = document.getElementById('scanTabBtn');

    const targetUrlEl        = document.getElementById('targetUrl');
    const loadingState       = document.getElementById('loadingState');
    const resultState        = document.getElementById('resultState');
    const verdictBanner      = document.getElementById('verdictBanner');
    const verdictText        = document.getElementById('verdictText');
    const probabilityRow     = document.getElementById('probabilityRow');
    const probabilityValue   = document.getElementById('probabilityValue');
    const signalBarsEl       = document.getElementById('signalBars');
    const reasonsContainer   = document.getElementById('reasonsContainer');
    const latencyDisplay     = document.getElementById('latencyDisplay');
    const resolvedUrlSection = document.getElementById('resolvedUrlSection');
    const resolvedUrlEl      = document.getElementById('resolvedUrl');
    const verificationBanner = document.getElementById('verificationBanner');
    const reachabilityBanner = document.getElementById('reachabilityBanner');

    manualUrlInput.focus();

    // ─── Scan pasted URL ────────────────────────────────────────
    scanPastedBtn.addEventListener('click', () => {
        let url = manualUrlInput.value.trim();
        if (!url) return;
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
        analyzeUrl(url);
    });

    manualUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') scanPastedBtn.click();
    });

    // ─── Extract current tab URL ────────────────────────────────
    scanTabBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            manualUrlInput.value = (tab && tab.url && !tab.url.startsWith('chrome://'))
                ? tab.url
                : 'Cannot scan this internal page';
        } catch (err) {
            console.error('Tab query failed:', err);
        }
    });

    // ─── Call backend ────────────────────────────────────────────
    async function analyzeUrl(url) {
        resultState.classList.add('hidden');
        loadingState.classList.remove('hidden');
        targetUrlEl.textContent = url;
        resolvedUrlSection.classList.add('hidden');
        verificationBanner.classList.add('hidden');

        try {
            const res = await fetch('http://localhost:8000/predict/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: [url] })
            });
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                showResult(data[0]);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (err) {
            console.error('Analysis Error:', err);
            showResult({
                verdict: 'error',
                risk_score: 0,
                risk_probability: 0,
                reasons: [`Connection failed — ensure backend is running on port 8000. (${err.message})`],
                latency_ms: 0
            });
        }
    }

    // ─── Verdict config ──────────────────────────────────────────
    const VERDICT_CONFIG = {
        'SAFE':                  { cls: 'is-safe',         label: 'SAFE',                  scoreColor: 'var(--safe)'       },
        'SUSPICIOUS':            { cls: 'is-suspicious',   label: 'SUSPICIOUS',             scoreColor: 'var(--suspicious)' },
        'HIGH_RISK':             { cls: 'is-high-risk',    label: 'HIGH RISK',              scoreColor: 'var(--high-risk)'  },
        'PHISHING':              { cls: 'is-phishing',     label: 'PHISHING',               scoreColor: 'var(--phishing)'   },
        'VERIFICATION_REQUIRED': { cls: 'is-verify',       label: 'VERIFY',                 scoreColor: 'var(--verify)'     },
        'error':                 { cls: 'is-suspicious',   label: 'ERROR',                  scoreColor: 'var(--text-dim)'   },
    };

    // ─── Signal weights (mirror compute_logit in app.py) ─────────
    const SIGNAL_WEIGHTS = {
        uncertainty:        2.5,
        is_unreachable:     2.5,
        visual_score:       2.5,
        namespace_risk:     2.0,
        access_friction:    2.0,
        is_shortener:       2.0,
        gnn_score:          2.0,
        nlp_score:          1.8,
        redirect_depth:     1.5,
        has_ip_pattern:     1.5,
        structural_anomaly: 1.5,
    };

    const SIGNAL_LABELS = {
        uncertainty:        'Uncertainty',
        namespace_risk:     'Namespace',
        access_friction:    'Access Block',
        structural_anomaly: 'Structure',
        gnn_score:          'Graph (GNN)',
        nlp_score:          'Semantic',
        is_unreachable:     'NXDOMAIN',
        is_shortener:       'Shortener',
        redirect_depth:     'Redirect',
        visual_score:       'Visual Sim',
        has_ip_pattern:     'IP Pattern',
    };

    // ─── 1-line explanation generator ────────────────────────────
    function generateExplanation(verdictKey, signals, reasons) {
        if (verdictKey === 'SAFE') return 'No significant threat signals detected.';
        if (verdictKey === 'VERIFICATION_REQUIRED') return null;
        if (signals) {
            const top = Object.entries(signals)
                .filter(([k]) => SIGNAL_LABELS[k])
                .map(([k, v]) => ({ key: k, importance: (SIGNAL_WEIGHTS[k] || 1) * v }))
                .sort((a, b) => b.importance - a.importance)
                .slice(0, 2)
                .map(({ key }) => SIGNAL_LABELS[key].toLowerCase());
            if (top.length > 0) {
                const prefix = verdictKey === 'PHISHING' ? 'Flagged as phishing'
                             : verdictKey === 'HIGH_RISK' ? 'High risk'
                             : 'Suspicious';
                return `${prefix} due to ${top.join(' and ')}.`;
            }
        }
        if (reasons && reasons.length > 0) return reasons[0].split(' [')[0];
        return null;
    }

    // ─── Display result ──────────────────────────────────────────
    function showResult(result) {
        loadingState.classList.add('hidden');
        resultState.classList.remove('hidden');

        const verdictKey = (result.verdict || 'error').toUpperCase().replace(/ /g, '_');
        const cfg = VERDICT_CONFIG[verdictKey] || VERDICT_CONFIG['error'];

        // Verdict banner
        verdictBanner.className = 'verdict-banner ' + cfg.cls;
        verdictText.textContent = cfg.label;

        // Risk probability — color-coded with contextual label
        const prob = result.risk_probability;
        if (prob != null) {
          const probPct = (prob * 100).toFixed(1);
          let probColor, probLabel;
          if (prob >= 0.8)      { probColor = 'var(--phishing)';   probLabel = 'Critical'; }
          else if (prob >= 0.6) { probColor = 'var(--high-risk)';  probLabel = 'High';     }
          else if (prob >= 0.4) { probColor = 'var(--suspicious)'; probLabel = 'Moderate'; }
          else                  { probColor = 'var(--safe)';        probLabel = 'Low';      }
          probabilityValue.textContent = `${probPct}% — ${probLabel}`;
          probabilityValue.style.color = probColor;
          probabilityRow.style.display = 'flex';
        } else {
          probabilityValue.textContent = 'N/A';
          probabilityValue.style.color = 'var(--text-dim)';
          probabilityRow.style.display = verdictKey === 'VERIFICATION_REQUIRED' ? 'none' : 'flex';
        }

        // Pulse indicator color
        const pulseEl = document.querySelector('.pulse-indicator');
        if (verdictKey === 'PHISHING') {
            pulseEl.style.backgroundColor = 'var(--phishing)';
            pulseEl.style.animation = 'none';
        } else if (verdictKey === 'HIGH_RISK') {
            pulseEl.style.backgroundColor = 'var(--high-risk)';
        } else {
            pulseEl.style.backgroundColor = '';
            pulseEl.style.animation = '';
        }

        // VERIFICATION_REQUIRED state banner — context-aware
        if (verdictKey === 'VERIFICATION_REQUIRED') {
            verificationBanner.classList.remove('hidden');
            const verifyTitle = verificationBanner.querySelector('.verify-title');
            const verifySub = verificationBanner.querySelector('.verify-sub');
            if (result.reachability === 'unreachable') {
                if (verifyTitle) verifyTitle.textContent = 'Domain Unreachable';
                if (verifySub) verifySub.textContent = 'Cannot resolve domain (NXDOMAIN/Timeout). No data to verify safety. Exercise caution.';
            } else {
                if (verifyTitle) verifyTitle.textContent = 'Inspection Blocked';
                if (verifySub) verifySub.textContent = 'Anti-bot protection prevents automated analysis. Manual verification recommended.';
            }
        } else {
            verificationBanner.classList.add('hidden');
        }

        // Resolved URL
        if (result.resolved_url) {
            resolvedUrlSection.classList.remove('hidden');
            resolvedUrlEl.textContent = result.resolved_url;
        } else {
            resolvedUrlSection.classList.add('hidden');
        }

        // Explanation line
        const explanation = generateExplanation(verdictKey, result.signals, result.reasons);
        let explanationEl = document.getElementById('explanationLine');
        if (!explanationEl) {
            explanationEl = document.createElement('p');
            explanationEl.id = 'explanationLine';
            explanationEl.className = 'explanation-line';
            signalBarsEl.parentNode.insertBefore(explanationEl, signalBarsEl);
        }
        explanationEl.textContent = explanation || '';
        explanationEl.style.display = explanation ? 'block' : 'none';

        // Signal bars — sorted by importance (weight × value), top 5
        signalBarsEl.innerHTML = '';
        if (result.signals) {
            const sorted = Object.entries(result.signals)
                .filter(([k]) => SIGNAL_LABELS[k])
                .map(([k, v]) => ({ key: k, value: v, importance: (SIGNAL_WEIGHTS[k] || 1) * v }))
                .sort((a, b) => b.importance - a.importance)
                .slice(0, 5);

            sorted.forEach(({ key, value }) => {
                const pct = Math.round(value * 100);
                const barColor = pct <= 25 ? '#2ea043' : pct <= 50 ? '#d29922' : pct <= 75 ? '#e86c00' : '#f85149';
                const row = document.createElement('div');
                row.className = 'signal-row';
                row.innerHTML = `
                    <span class="signal-label">${SIGNAL_LABELS[key]}</span>
                    <div class="signal-track">
                        <div class="signal-fill" style="width:${pct}%; background:${barColor};"></div>
                    </div>
                    <span class="signal-val">${value.toFixed(2)}</span>
                `;
                signalBarsEl.appendChild(row);
            });

            const divider = document.createElement('div');
            divider.className = 'signal-divider';
            signalBarsEl.appendChild(divider);
        }

        // Reasons
        reasonsContainer.innerHTML = '';
        (result.reasons || []).forEach(reason => {
            const clean = reason.split(' [')[0];
            const div = document.createElement('div');
            div.className = 'reason-item';
            div.textContent = clean;
            reasonsContainer.appendChild(div);
        });

        // Reachability
        if (result.reachability === 'unreachable') {
            reachabilityBanner.classList.remove('hidden');
        } else {
            reachabilityBanner.classList.add('hidden');
        }

        // Latency
        if (result.latency_ms > 0) {
            latencyDisplay.textContent = `Analyzed in ${result.latency_ms}ms`;
        }
    }
});
