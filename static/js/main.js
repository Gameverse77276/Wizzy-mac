let currentCategory = 'all';
let positions = [];
let priceUpdateInterval = null;
let btcPriceInterval = null;
let currentBtcPrice = 0;

let currentOpenModalSymbol = null;
let partialCloseRules = [];

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="font-size: 1.5rem;">
                ${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 0.25rem;">${type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Info'}</div>
                <div style="font-size: 0.875rem; color: var(--text-secondary);">${message}</div>
            </div>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}


async function updateBtcPrice() {
    try {
        const response = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT');
        const data = await response.json();

        if (data.retCode === 0 && data.result && data.result.list && data.result.list.length > 0) {
            const price = parseFloat(data.result.list[0].lastPrice);
            currentBtcPrice = price;
            const btcPriceElement = document.getElementById('btcPrice');
            if (btcPriceElement) {
                btcPriceElement.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
            }

            const modalBtcPrice = document.getElementById('modalBtcPrice');
            if (modalBtcPrice) {
                modalBtcPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
            }

            const applyRulesBtcPrice = document.getElementById('applyRulesBtcPrice');
            if (applyRulesBtcPrice) {
                applyRulesBtcPrice.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
            }
        }
    } catch (error) {
        console.error('Failed to fetch BTC price:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('BTC Rules Script initialized');
    setupEventListeners();
    loadPositions();
    updateBtcPrice();
    btcPriceInterval = setInterval(updateBtcPrice, 2000);
});


function setupEventListeners() {
    document.getElementById('refreshBtn').addEventListener('click', loadPositions);

    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            loadPositions();
        });
    });
}


async function loadPositions() {
    const grid = document.getElementById('positionsGrid');
    const emptyState = document.getElementById('emptyState');
    const errorState = document.getElementById('errorState');

    if (positions.length === 0) {
        grid.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Loading coins...</p>
            </div>
        `;
    }

    emptyState.style.display = 'none';
    errorState.style.display = 'none';

    try{
        const response = await fetch(`http://127.0.0.1:5000/api/positions?category=${currentCategory}`);
        const data = await response.json();

        if (data.error) {
            showError(data.error);
            return;
        }

        let allPositions = data.positions || [];

        positions = allPositions;

        updateHeaderStats(positions);

        if (positions.length === 0) {
            grid.style.display = 'none';
            emptyState.style.display = 'block';
            updateStatus('connected', 'No Coins');
            stopPriceUpdates();
        } else {
            grid.style.display = 'grid';
            renderPositions(positions);
            updateStatus('connected', 'Active');
            startPriceUpdates();
        }

    } catch (error) {
        console.error('Error loading positions:', error);
        showError(error.message);
    }
}


function renderPositions(positions) {
    const grid = document.getElementById('positionsGrid');

    grid.innerHTML = positions.map(pos => {
        const isSpot = pos.side === 'Spot';
        const pnlClass = pos.unrealized_pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
        const pnlSign = pos.unrealized_pnl >= 0 ? '+' : '';

        let badgeClass, badgeText;
        if (isSpot) {
            badgeClass = 'side-spot';
            badgeText = 'SPOT';
        } else if (pos.side === 'Buy') {
            badgeClass = 'side-long';
            badgeText = `LONG ${pos.leverage}x`;
        } else {
            badgeClass = 'side-short';
            badgeText = `SHORT ${pos.leverage}x`;
        }

        return `
            <div class="position-card" data-symbol="${pos.symbol}" onclick="if(event.target.closest('.position-actions')) return; openPositionModal('${pos.symbol}')">
                <div class="position-header">
                    <div class="position-symbol">
                        ${isSpot ? pos.coin : pos.symbol}
                        ${pos.monitor ? '<span class="btc-monitor-active" style="color: var(--accent-primary); margin-left: 0.5rem;">₿</span>' : ''}
                    </div>
                    <div class="position-side ${badgeClass}">${badgeText}</div>
                </div>

                <div class="position-details">
                    <div class="detail-item">
                        <div class="detail-label">Size</div>
                        <div class="detail-value">${parseFloat(pos.size).toFixed(2)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Position Value</div>
                        <div class="detail-value price-value" data-field="position_value">$${(pos.position_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Entry Price</div>
                        <div class="detail-value">$${parseFloat(pos.entry_price || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Current Price</div>
                        <div class="detail-value price-value" data-field="current_price">$${parseFloat(pos.current_price || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})}</div>
                    </div>
                </div>

                <div class="pnl-section">
                    <div class="detail-label">Unrealized PnL</div>
                    <div class="pnl-value price-value ${pnlClass}" data-field="unrealized_pnl">${pnlSign}$${Math.abs(pos.unrealized_pnl || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="pnl-percentage price-value ${pnlClass}" data-field="pnl_percentage">${pnlSign}${(pos.pnl_percentage || 0).toFixed(2)}%</div>
                </div>

                ${pos.monitor ? `
                    <div style="margin-top: 1rem; padding: 0.75rem; background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.08) 100%); border: 1px solid var(--accent-primary); border-radius: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.375rem; margin-bottom: 0.5rem;">
                            <span class="btc-monitor-active" style="font-size: 0.875rem;">₿</span>
                            <div style="font-size: 0.75rem; font-weight: 600; color: var(--accent-primary); text-transform: uppercase; letter-spacing: 0.5px;">BTC Rules Active</div>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">
                            ${pos.monitor.rules ? pos.monitor.rules.length : 0} rule(s) configured
                        </div>
                        <div style="margin-top: 0.5rem;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-bottom: 0.25rem;">
                                <span style="color: var(--text-muted);">Remaining:</span>
                                <span style="color: var(--text-primary); font-weight: 600;">${((pos.monitor.remaining_size / pos.monitor.original_size) * 100).toFixed(0)}%</span>
                            </div>
                            <div style="height: 3px; background: var(--bg-primary); border-radius: 2px; overflow: hidden;">
                                <div style="height: 100%; background: var(--accent-primary); width: ${((pos.monitor.remaining_size / pos.monitor.original_size) * 100).toFixed(0)}%; transition: width 0.3s;"></div>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <div class="position-actions">
                    <button class="action-btn" onclick="openRulesForm('${pos.symbol}')">
                        Apply Rules
                    </button>
                    <button class="action-btn" onclick="viewDetails('${pos.symbol}')">
                        View Details
                    </button>
                </div>
            </div>
        `;
    }).join('');
}


function startPriceUpdates() {
    stopPriceUpdates();

    priceUpdateInterval = setInterval(async () => {
        await updatePricesOnly();
    }, 2000);
}


function stopPriceUpdates() {
    if (priceUpdateInterval) {
        clearInterval(priceUpdateInterval);
        priceUpdateInterval = null;
    }
}


async function updatePricesOnly() {
    if (positions.length === 0) return;

    try {
        const response = await fetch(`http://127.0.0.1:5000/api/positions?category=${currentCategory}`);
        const data = await response.json();

        if (data.error || !data.positions) return;

        let newPositions = data.positions;
        let needsFullRerender = false;

        newPositions.forEach(newPos => {
            const oldPos = positions.find(p => p.symbol === newPos.symbol);
            if (!oldPos) {
                needsFullRerender = true;
                return;
            }

            const card = document.querySelector(`.position-card[data-symbol="${newPos.symbol}"]`);
            if (!card) return;

            const hadMonitor = oldPos.monitor !== null && oldPos.monitor !== undefined;
            const hasMonitor = newPos.monitor !== null && newPos.monitor !== undefined;
            const monitorChanged = hadMonitor !== hasMonitor;

            const rulesChanged = hasMonitor && hadMonitor &&
                JSON.stringify(oldPos.monitor) !== JSON.stringify(newPos.monitor);

            if (monitorChanged || rulesChanged) {
                needsFullRerender = true;
            } else {
                updateValueWithAnimation(card, 'current_price', oldPos.current_price, newPos.current_price, true);
                updateValueWithAnimation(card, 'position_value', oldPos.position_value, newPos.position_value, true);
                updateValueWithAnimation(card, 'unrealized_pnl', oldPos.unrealized_pnl, newPos.unrealized_pnl, true, newPos.unrealized_pnl >= 0);
                updateValueWithAnimation(card, 'pnl_percentage', oldPos.pnl_percentage, newPos.pnl_percentage, false, newPos.pnl_percentage >= 0);
            }

            Object.assign(oldPos, newPos);
        });

        if (positions.length !== newPositions.length) {
            needsFullRerender = true;
        }

        updateHeaderStats(newPositions);
        positions = newPositions;

        if (needsFullRerender) {
            console.log('[UI UPDATE] Monitor status changed - re-rendering positions');
            renderPositions(positions);
        }

    } catch (error) {
        console.error('Error updating prices:', error);
    }
}


function updateValueWithAnimation(card, field, oldValue, newValue, isCurrency = false, isPositive = null) {
    const element = card.querySelector(`[data-field="${field}"]`);
    if (!element) return;

    if (oldValue === newValue && !field.includes('pnl')) return;

    element.classList.add('price-flash');
    setTimeout(() => element.classList.remove('price-flash'), 300);

    let displayValue;
    if (field === 'pnl_percentage') {
        const sign = newValue >= 0 ? '+' : '';
        displayValue = `${sign}${newValue.toFixed(2)}%`;
    } else if (isCurrency) {
        const sign = field.includes('pnl') ? (newValue >= 0 ? '+' : '-') : '';
        displayValue = `${sign}$${Math.abs(newValue).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: field === 'current_price' ? 4 : 2})}`;
    } else {
        displayValue = newValue.toString();
    }

    element.textContent = displayValue;

    if (isPositive !== null) {
        element.classList.remove('pnl-positive', 'pnl-negative');
        element.classList.add(isPositive ? 'pnl-positive' : 'pnl-negative');
    }
}


function updateHeaderStats(positions) {
    const totalPositions = positions.length;
    const totalPnL = positions.reduce((sum, pos) => sum + pos.unrealized_pnl, 0);

    document.getElementById('totalPositions').textContent = totalPositions;

    const pnlElement = document.getElementById('totalPnL');
    const pnlSign = totalPnL >= 0 ? '+' : '';
    pnlElement.textContent = `${pnlSign}$${Math.abs(totalPnL).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    pnlElement.style.color = totalPnL >= 0 ? 'var(--success)' : 'var(--danger)';
}


function updateStatus(status, text) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (status === 'connected') {
        statusDot.style.background = 'var(--success)';
        statusText.textContent = text;
    } else if (status === 'error') {
        statusDot.style.background = 'var(--danger)';
        statusText.textContent = text;
    } else {
        statusDot.style.background = 'var(--warning)';
        statusText.textContent = text;
    }
}


function showError(message) {
    const grid = document.getElementById('positionsGrid');
    const errorState = document.getElementById('errorState');

    grid.style.display = 'none';
    errorState.style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
    updateStatus('error', 'Connection Error');
    stopPriceUpdates();
}


function openPositionModal(symbol) {
    const position = positions.find(p => p.symbol === symbol);
    if (!position) return;

    viewDetails(symbol);
}


function closeModal() {
    document.getElementById('positionModal').style.display = 'none';
    currentOpenModalSymbol = null;
}


function viewDetails(symbol) {
    const position = positions.find(p => p.symbol === symbol);
    if (!position) return;

    const modal = document.getElementById('positionModal');
    const modalBody = document.getElementById('modalBody');

    const isSpot = position.side === 'Spot';
    const pnlClass = position.unrealized_pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    const pnlSign = position.unrealized_pnl >= 0 ? '+' : '';

    let badgeClass, badgeText;
    if (isSpot) {
        badgeClass = 'side-spot';
        badgeText = 'SPOT';
    } else if (position.side === 'Buy') {
        badgeClass = 'side-long';
        badgeText = `LONG ${position.leverage}x`;
    } else {
        badgeClass = 'side-short';
        badgeText = `SHORT ${position.leverage}x`;
    }

    let rulesDisplay = '';
    if (position.monitor && position.monitor.rules) {
        rulesDisplay = `
            <div style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%); border: 1px solid var(--accent-primary); border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1.5rem; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 1.25rem;">₿</span>
                        <strong style="color: var(--accent-primary); font-size: 1rem;">Active BTC Rules</strong>
                    </div>
                    <button class="btn btn-secondary" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;" onclick="event.stopPropagation(); removeBTCRules('${position.symbol}')">Remove All</button>
                </div>

                ${position.monitor.rules.map((rule, idx) => {
                    // Generate rule_id matching backend format
                    let ruleId;
                    if (rule.type === 'partial_close') {
                        ruleId = `${rule.type}_${rule.btc_price}_${rule.close_percent}`;
                    } else if (rule.type === 'set_tp') {
                        ruleId = `${rule.type}_${rule.btc_price}_${rule.tp_price}_${rule.close_percent}`;
                    } else if (rule.type === 'set_sl') {
                        ruleId = `${rule.type}_${rule.btc_price}_${rule.sl_price}`;
                    } else {
                        ruleId = `${rule.type}_${rule.btc_price}`;
                    }

                    const isTriggered = position.monitor.triggered_rules && position.monitor.triggered_rules.includes(ruleId);
                    let ruleText = '';
                    let ruleColor = 'var(--accent-primary)';

                    if (rule.type === 'full_close') {
                        ruleText = `Rule 1: Full close when BTC reaches $${rule.btc_price.toLocaleString()}`;
                        ruleColor = 'var(--danger)';
                    } else if (rule.type === 'partial_close') {
                        ruleText = `Rule 2: Close ${rule.close_percent}% when BTC reaches $${rule.btc_price.toLocaleString()}`;
                        ruleColor = 'var(--warning)';
                    } else if (rule.type === 'set_tp') {
                        ruleText = `Rule 3: Set TP at $${rule.tp_price} (close ${rule.close_percent}%) when BTC reaches $${rule.btc_price.toLocaleString()}`;
                        ruleColor = 'var(--success)';
                    } else if (rule.type === 'set_sl') {
                        ruleText = `Rule 4: Set SL at $${rule.sl_price} (Full Close) when BTC reaches $${rule.btc_price.toLocaleString()}`;
                        ruleColor = 'var(--danger)';
                    }

                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: ${isTriggered ? 'var(--bg-primary)' : 'rgba(99, 102, 241, 0.05)'}; border: 1px solid ${isTriggered ? 'var(--border)' : ruleColor}; border-radius: 0.5rem; margin-bottom: 0.5rem; ${isTriggered ? 'opacity: 0.5;' : ''}">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: ${isTriggered ? 'var(--text-muted)' : ruleColor}; font-size: 0.875rem; ${isTriggered ? 'text-decoration: line-through;' : ''}">
                                    ${ruleText}
                                </div>
                            </div>
                            ${isTriggered ? '<span style="color: var(--accent-primary); font-size: 1rem; margin-left: 0.5rem;">✓</span>' : `<button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; margin-left: 0.5rem;" onclick="event.stopPropagation(); removeIndividualRule('${position.symbol}', ${idx})">Remove</button>`}
                        </div>
                    `;
                }).join('')}

                ${position.monitor.active_tp ? `
                    <div style="padding: 0.75rem; background: rgba(34, 197, 94, 0.1); border: 1px solid var(--success); border-radius: 0.5rem; margin-top: 0.75rem;">
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Active TP:</div>
                        <div style="font-weight: 600; color: var(--success);">
                            $${position.monitor.active_tp.price.toLocaleString()} (${position.monitor.active_tp.close_percent}%)
                        </div>
                    </div>
                ` : ''}

                ${position.monitor.active_sl ? `
                    <div style="padding: 0.75rem; background: rgba(248, 81, 73, 0.1); border: 1px solid var(--danger); border-radius: 0.5rem; margin-top: 0.75rem;">
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Active SL:</div>
                        <div style="font-weight: 600; color: var(--danger);">
                            $${position.monitor.active_sl.price.toLocaleString()} (${position.monitor.active_sl.close_percent}%)
                        </div>
                    </div>
                ` : ''}

                <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 0.5rem; font-size: 0.875rem; margin-top: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--text-muted);">Position Tracking:</span>
                        <div style="display: flex; gap: 1rem;">
                            <div style="text-align: right;">
                                <div style="font-size: 0.7rem; color: var(--text-muted);">Closed</div>
                                <div style="color: var(--success); font-weight: 600;">${((position.monitor.original_size - position.monitor.remaining_size) / position.monitor.original_size * 100).toFixed(0)}%</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 0.7rem; color: var(--text-muted);">Remaining</div>
                                <div style="color: var(--text-primary); font-weight: 600;">${(position.monitor.remaining_size / position.monitor.original_size * 100).toFixed(0)}%</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    modalBody.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">${isSpot ? position.coin : position.symbol}</h3>
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                <div class="position-side ${badgeClass}" style="display: inline-block;">
                    ${badgeText}
                </div>
                <div style="padding: 0.375rem 1rem; background: rgba(0, 217, 255, 0.1); border: 1px solid var(--accent-primary); border-radius: 0.5rem;">
                    <span style="font-size: 0.75rem; color: var(--text-muted); margin-right: 0.5rem;">BTC:</span>
                    <span id="modalBtcPrice" style="font-size: 0.875rem; font-weight: 700; color: var(--accent-primary);">${currentBtcPrice > 0 ? `$${currentBtcPrice.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}` : '-'}</span>
                </div>
            </div>
        </div>

        <div class="position-details" style="margin-bottom: 1rem;">
            <div class="detail-item">
                <div class="detail-label">Size</div>
                <div class="detail-value">${parseFloat(position.size).toFixed(2)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Entry Price</div>
                <div class="detail-value">$${parseFloat(position.entry_price || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Current Price</div>
                <div class="detail-value">$${parseFloat(position.current_price || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Position Value</div>
                <div class="detail-value">$${(position.position_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
        </div>

        <div class="pnl-section" style="margin-bottom: 1.5rem;">
            <div class="detail-label">Unrealized PnL</div>
            <div class="pnl-value ${pnlClass}">${pnlSign}$${Math.abs(position.unrealized_pnl || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <div class="pnl-percentage ${pnlClass}">${pnlSign}${(position.pnl_percentage || 0).toFixed(2)}%</div>
        </div>

        ${rulesDisplay}

        <div style="display: grid; gap: 1rem; margin-bottom: 1.5rem;">
            <button class="btn btn-primary" style="width: 100%;" onclick="openRulesForm('${position.symbol}')">
                ${position.monitor ? 'Update' : 'Apply'} BTC Rules
            </button>
            <button class="btn" style="width: 100%; background: var(--danger); color: white; border: none;" onclick="closePosition('${position.symbol}', '${position.side === 'Spot' ? 'spot' : 'linear'}')">
                Close Position
            </button>
        </div>

        <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">
            Last Updated: ${new Date(position.updated_at).toLocaleString()}
        </div>
    `;

    modal.style.display = 'flex';
    currentOpenModalSymbol = symbol;
}


function openRulesForm(symbol) {
    const position = positions.find(p => p.symbol === symbol);
    if (!position) return;

    const modal = document.getElementById('positionModal');
    const modalBody = document.getElementById('modalBody');

    const category = position.side === 'Spot' ? 'spot' : 'linear';
    const isLong = position.side === 'Buy' || position.side === 'Spot';

    modalBody.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">${symbol}</h3>
            <p style="color: var(--text-secondary);">Configure BTC-Based Rules</p>
            <div style="margin-top: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 0.5rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1rem; font-size: 0.875rem;">
                    <div>
                        <span style="color: var(--text-muted);">Side:</span>
                        <span style="color: var(--text-primary); font-weight: 600; margin-left: 0.5rem;">${position.side === 'Buy' ? 'LONG' : position.side === 'Sell' ? 'SHORT' : 'SPOT'}</span>
                    </div>
                    <div>
                        <span style="color: var(--text-muted);">Size:</span>
                        <span style="color: var(--text-primary); font-weight: 600; margin-left: 0.5rem;">${parseFloat(position.size).toFixed(2)}</span>
                    </div>
                    <div>
                        <span style="color: var(--text-muted);">Price:</span>
                        <span style="color: var(--text-primary); font-weight: 600; margin-left: 0.5rem;">$${(position.current_price || 0).toLocaleString()}</span>
                    </div>
                    <div>
                        <span style="color: var(--text-muted);">BTC:</span>
                        <span id="applyRulesBtcPrice" style="color: var(--accent-primary); font-weight: 700; margin-left: 0.5rem;">${currentBtcPrice > 0 ? `$${currentBtcPrice.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}` : '-'}</span>
                    </div>
                </div>
            </div>
        </div>

        <div style="margin-bottom: 1rem; padding: 1rem; background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.05) 100%); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 0.75rem;">
            <div style="font-weight: 600; color: var(--accent-primary); margin-bottom: 0.5rem;">₿ BTC-Based Rules</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">All rules trigger when Bitcoin (BTC) reaches specific prices</div>
        </div>

        <!-- Rule 1: Full Close -->
        <div id="rule1Container" style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(248, 81, 73, 0.05); border: 1px solid var(--border); border-radius: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <label style="font-weight: 600; color: var(--danger);">Rule 1: Full Close when BTC reaches price</label>
                <label style="position: relative; display: inline-block; width: 44px; height: 24px;">
                    <input type="checkbox" id="rule1Toggle" class="rule-toggle" onchange="toggleRule('rule1')" style="opacity: 0; width: 0; height: 0;">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div id="rule1Fields" style="display: none;">
                <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">BTC Price</label>
                <input type="number" step="0.01" placeholder="e.g. 100000" id="rule1BtcPrice" class="form-input" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-primary); font-size: 0.875rem;">
            </div>
        </div>

        <!-- Rule 2: Partial Close (Multiple) -->
        <div id="rule2Container" style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(245, 158, 11, 0.05); border: 1px solid var(--border); border-radius: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <label style="font-weight: 600; color: var(--warning);">Rule 2: Partial Close when BTC reaches price</label>
            </div>
            <div id="partialCloseRulesList" style="margin-bottom: 0.75rem;"></div>
            <button type="button" class="btn btn-secondary" style="width: 100%; padding: 0.5rem;" onclick="addPartialCloseRule()">
                + Add Partial Close Rule
            </button>
        </div>

        <!-- Rule 3: Set TP -->
        <div id="rule3Container" style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(34, 197, 94, 0.05); border: 1px solid var(--border); border-radius: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <label style="font-weight: 600; color: var(--success);">Rule 3: Set/Move TP when BTC reaches price</label>
                <label style="position: relative; display: inline-block; width: 44px; height: 24px;">
                    <input type="checkbox" id="rule3Toggle" class="rule-toggle" onchange="toggleRule('rule3')" style="opacity: 0; width: 0; height: 0;">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div id="rule3Fields" style="display: none;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding: 0.5rem; background: rgba(34, 197, 94, 0.1); border-radius: 0.375rem;">
                    <label style="position: relative; display: inline-block; width: 44px; height: 24px;">
                        <input type="checkbox" id="rule3FullClose" onchange="toggleFullClose('rule3')" style="opacity: 0; width: 0; height: 0;">
                        <span class="toggle-slider"></span>
                    </label>
                    <label style="font-size: 0.875rem; color: var(--success); font-weight: 600; cursor: pointer;" onclick="document.getElementById('rule3FullClose').click()">Full Close (100%)</label>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">BTC Price</label>
                        <input type="number" step="0.01" placeholder="e.g. 98000" id="rule3BtcPrice" class="form-input" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-primary); font-size: 0.875rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">TP Price</label>
                        <input type="number" step="0.0001" placeholder="e.g. 2.50" id="rule3TpPrice" class="form-input" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-primary); font-size: 0.875rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Close %</label>
                        <input type="number" step="1" placeholder="30" id="rule3ClosePercent" class="form-input" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-primary); font-size: 0.875rem;">
                    </div>
                </div>
            </div>
        </div>

        <!-- Rule 4: Set SL -->
        <div id="rule4Container" style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(248, 81, 73, 0.05); border: 1px solid var(--border); border-radius: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <label style="font-weight: 600; color: var(--danger);">Rule 4: Set/Move SL when BTC reaches price (Full Close)</label>
                <label style="position: relative; display: inline-block; width: 44px; height: 24px;">
                    <input type="checkbox" id="rule4Toggle" class="rule-toggle" onchange="toggleRule('rule4')" style="opacity: 0; width: 0; height: 0;">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div id="rule4Fields" style="display: none;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">BTC Price</label>
                        <input type="number" step="0.01" placeholder="e.g. 92000" id="rule4BtcPrice" class="form-input" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-primary); font-size: 0.875rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">SL Price</label>
                        <input type="number" step="0.0001" placeholder="e.g. 1.80" id="rule4SlPrice" class="form-input" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-primary); font-size: 0.875rem;">
                    </div>
                </div>
            </div>
        </div>

        <div style="display: grid; gap: 0.75rem;">
            <button class="btn btn-primary" style="width: 100%;" onclick="saveRules('${symbol}', '${category}', '${position.side}', ${position.size})">
                Apply BTC Rules
            </button>
            <button class="btn btn-secondary" style="width: 100%;" onclick="viewDetails('${symbol}')">
                Cancel
            </button>
        </div>
    `;

    modal.style.display = 'flex';

    setTimeout(() => {
        partialCloseRules = [];

        if (position.monitor && position.monitor.rules) {
            console.log('[FORM] Loading existing rules:', position.monitor.rules);

            position.monitor.rules.forEach(rule => {
                if (rule.type === 'full_close') {
                    const toggle = document.getElementById('rule1Toggle');
                    const field = document.getElementById('rule1BtcPrice');
                    if (toggle && field) {
                        toggle.checked = true;
                        field.value = rule.btc_price;
                        toggleRule('rule1');
                    }
                } else if (rule.type === 'partial_close') {
                    partialCloseRules.push({
                        btc_price: rule.btc_price,
                        close_percent: rule.close_percent
                    });
                } else if (rule.type === 'set_tp') {
                    const toggle = document.getElementById('rule3Toggle');
                    const btcField = document.getElementById('rule3BtcPrice');
                    const tpField = document.getElementById('rule3TpPrice');
                    const percentField = document.getElementById('rule3ClosePercent');
                    const fullCloseToggle = document.getElementById('rule3FullClose');
                    if (toggle && btcField && tpField && percentField && fullCloseToggle) {
                        toggle.checked = true;
                        btcField.value = rule.btc_price;
                        tpField.value = rule.tp_price;
                        percentField.value = rule.close_percent;
                        toggleRule('rule3');
                        if (rule.close_percent === 100) {
                            fullCloseToggle.checked = true;
                            toggleFullClose('rule3');
                        }
                    }
                } else if (rule.type === 'set_sl') {
                    const toggle = document.getElementById('rule4Toggle');
                    const btcField = document.getElementById('rule4BtcPrice');
                    const slField = document.getElementById('rule4SlPrice');
                    if (toggle && btcField && slField) {
                        toggle.checked = true;
                        btcField.value = rule.btc_price;
                        slField.value = rule.sl_price;
                        toggleRule('rule4');
                    }
                }
            });

            renderPartialCloseRules();
            console.log('[FORM] Existing rules loaded successfully');
        } else {
            console.log('[FORM] No existing rules to load');
            renderPartialCloseRules();
        }
    }, 10);
}


function toggleRule(ruleId) {
    const toggle = document.getElementById(`${ruleId}Toggle`);
    const fields = document.getElementById(`${ruleId}Fields`);

    if (toggle.checked) {
        fields.style.display = 'block';
    } else {
        fields.style.display = 'none';
    }
}

function toggleFullClose(ruleId) {
    const fullCloseToggle = document.getElementById(`${ruleId}FullClose`);
    const closePercentField = document.getElementById(`${ruleId}ClosePercent`);

    if (fullCloseToggle.checked) {
        closePercentField.value = '100';
        closePercentField.disabled = true;
        closePercentField.style.opacity = '0.5';
        closePercentField.style.cursor = 'not-allowed';
    } else {
        closePercentField.value = '';
        closePercentField.disabled = false;
        closePercentField.style.opacity = '1';
        closePercentField.style.cursor = 'text';
    }
}

function addPartialCloseRule() {
    const ruleIndex = partialCloseRules.length;
    partialCloseRules.push({ btc_price: '', close_percent: '' });
    renderPartialCloseRules();
}

function removePartialCloseRule(index) {
    partialCloseRules.splice(index, 1);
    renderPartialCloseRules();
}

function renderPartialCloseRules() {
    const container = document.getElementById('partialCloseRulesList');
    if (!container) return;

    if (partialCloseRules.length === 0) {
        container.innerHTML = '<p style="font-size: 0.875rem; color: var(--text-muted); text-align: center; padding: 1rem;">No partial close rules added yet</p>';
        return;
    }

    const totalPercent = partialCloseRules.reduce((sum, rule) => {
        const percent = parseFloat(rule.close_percent) || 0;
        return sum + percent;
    }, 0);

    container.innerHTML = `
        <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: rgba(245, 158, 11, 0.1); border-radius: 0.375rem; font-size: 0.875rem; color: var(--warning); font-weight: 600;">
            Total to close: ${totalPercent}% of original position
        </div>
        ${partialCloseRules.map((rule, idx) => `
            <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 0.5rem;">
                <div>
                    <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">BTC Price</label>
                    <input type="number" step="0.01" placeholder="e.g. 95000" value="${rule.btc_price}" oninput="updatePartialCloseRule(${idx}, 'btc_price', this.value)" class="form-input" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-primary); font-size: 0.875rem;">
                </div>
                <div>
                    <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">Close %</label>
                    <input type="number" step="1" placeholder="50" value="${rule.close_percent}" oninput="updatePartialCloseRule(${idx}, 'close_percent', this.value)" class="form-input" style="width: 100%; padding: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-primary); font-size: 0.875rem;">
                </div>
                <div style="display: flex; align-items: flex-end;">
                    <button type="button" class="btn btn-secondary" style="padding: 0.5rem 0.75rem; height: fit-content;" onclick="removePartialCloseRule(${idx})">✕</button>
                </div>
            </div>
        `).join('')}
    `;
}

function updatePartialCloseRule(index, field, value) {
    if (partialCloseRules[index]) {
        partialCloseRules[index][field] = value;

        const totalPercent = partialCloseRules.reduce((sum, rule) => {
            const percent = parseFloat(rule.close_percent) || 0;
            return sum + percent;
        }, 0);

        const totalDisplay = document.querySelector('#partialCloseRulesList > div:first-child');
        if (totalDisplay) {
            totalDisplay.textContent = `Total to close: ${totalPercent}% of original position`;
        }
    }
}

async function saveRules(symbol, category, side, size) {
    const rules = [];

    if (document.getElementById('rule1Toggle').checked) {
        const btcPrice = parseFloat(document.getElementById('rule1BtcPrice').value);
        if (btcPrice) {
            rules.push({
                type: 'full_close',
                btc_price: btcPrice
            });
        }
    }

    partialCloseRules.forEach(rule => {
        const btcPrice = parseFloat(rule.btc_price);
        const closePercent = parseFloat(rule.close_percent);
        if (btcPrice && closePercent) {
            rules.push({
                type: 'partial_close',
                btc_price: btcPrice,
                close_percent: closePercent
            });
        }
    });

    if (document.getElementById('rule3Toggle').checked) {
        const btcPrice = parseFloat(document.getElementById('rule3BtcPrice').value);
        const tpPrice = parseFloat(document.getElementById('rule3TpPrice').value);
        const closePercent = parseFloat(document.getElementById('rule3ClosePercent').value);
        if (btcPrice && tpPrice && closePercent) {
            rules.push({
                type: 'set_tp',
                btc_price: btcPrice,
                tp_price: tpPrice,
                close_percent: closePercent
            });
        }
    }

    if (document.getElementById('rule4Toggle').checked) {
        const btcPrice = parseFloat(document.getElementById('rule4BtcPrice').value);
        const slPrice = parseFloat(document.getElementById('rule4SlPrice').value);
        if (btcPrice && slPrice) {
            rules.push({
                type: 'set_sl',
                btc_price: btcPrice,
                sl_price: slPrice,
                close_percent: 100
            });
        }
    }

    if (rules.length === 0) {
        if (confirm('No rules enabled. Do you want to remove all BTC rules for this position?')) {
            await removeBTCRules(symbol);
        }
        return;
    }

    try {
        showToast('Applying BTC rules...', 'info');

        const response = await fetch('http://127.0.0.1:5000/api/tp-sl/set', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                symbol,
                category,
                side,
                original_size: size,
                rules
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`BTC rules applied for ${symbol}!`, 'success');

            closeModal();

            await loadPositions();
            console.log('[REFRESH] Positions refreshed after applying rules');
        } else {
            showToast('Failed to apply rules', 'error');
        }
    } catch (error) {
        console.error('Error applying rules:', error);
        showToast('Error applying rules: ' + error.message, 'error');
    }
}


async function removeBTCRules(symbol) {
    if (!confirm(`Remove all BTC rules for ${symbol}?`)) return;

    try {
        showToast('Removing BTC rules...', 'info');

        const response = await fetch(`http://127.0.0.1:5000/api/tp-sl/remove/${symbol}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showToast(`BTC rules removed for ${symbol}`, 'success');

            closeModal();

            await loadPositions();
            console.log('[REFRESH] Positions refreshed after removing rules');
        } else {
            showToast('Failed to remove rules', 'error');
        }
    } catch (error) {
        console.error('Error removing rules:', error);
        showToast('Error removing rules: ' + error.message, 'error');
    }
}


async function removeIndividualRule(symbol, ruleIndex) {
    const position = positions.find(p => p.symbol === symbol);
    if (!position || !position.monitor) {
        showToast('No rules found for this position', 'error');
        return;
    }

    const monitor = position.monitor;
    const rule = monitor.rules[ruleIndex];

    if (!rule) {
        showToast('Rule not found', 'error');
        return;
    }

    let ruleDescription = '';
    if (rule.type === 'full_close') {
        ruleDescription = `Full close when BTC hits $${rule.btc_price.toLocaleString()}`;
    } else if (rule.type === 'partial_close') {
        ruleDescription = `Close ${rule.close_percent}% when BTC hits $${rule.btc_price.toLocaleString()}`;
    } else if (rule.type === 'set_tp') {
        ruleDescription = `Set TP at $${rule.tp_price} when BTC hits $${rule.btc_price.toLocaleString()}`;
    } else if (rule.type === 'set_sl') {
        ruleDescription = `Set SL at $${rule.sl_price} when BTC hits $${rule.btc_price.toLocaleString()}`;
    }

    if (!confirm(`Remove this rule?\n\n${ruleDescription}`)) return;

    try {
        showToast('Removing rule...', 'info');

        const updatedRules = monitor.rules.filter((_, idx) => idx !== ruleIndex);

        if (updatedRules.length === 0) {
            const response = await fetch(`http://127.0.0.1:5000/api/tp-sl/remove/${symbol}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                showToast(`Last rule removed for ${symbol}`, 'success');

                closeModal();

                await loadPositions();
                console.log('[REFRESH] Positions refreshed after removing last rule');
            } else {
                showToast('Failed to remove rule', 'error');
            }
        } else {
            const response = await fetch('http://127.0.0.1:5000/api/tp-sl/set', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    symbol: symbol,
                    category: monitor.category,
                    side: monitor.side,
                    original_size: monitor.original_size,
                    rules: updatedRules
                })
            });

            const data = await response.json();

            if (data.success) {
                showToast('Rule removed successfully', 'success');

                await loadPositions();
                viewDetails(symbol);
                console.log('[REFRESH] Positions refreshed after removing individual rule');
            } else {
                showToast('Failed to remove rule', 'error');
            }
        }
    } catch (error) {
        console.error('Error removing individual rule:', error);
        showToast('Error removing rule: ' + error.message, 'error');
    }
}


async function closePosition(symbol, category) {
    if (!confirm(`Are you sure you want to close your ${symbol} position?`)) {
        return;
    }

    try {
        const response = await fetch(`http://127.0.0.1:5000/api/close-position`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                symbol: symbol,
                category: category
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Position closed successfully: ${symbol}`, 'success');

            closeModal();

            await loadPositions();
            console.log('[REFRESH] Positions refreshed after closing position');
        } else {
            showToast(`Failed to close position: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Error closing position:', error);
        showToast('Error closing position: ' + error.message, 'error');
    }
}


document.addEventListener('click', function(event) {
    const modal = document.getElementById('positionModal');
    if (event.target === modal) {
        closeModal();
    }
});
