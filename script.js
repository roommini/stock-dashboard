let TWELVE_DATA_API_KEY = window.APP_CONFIG?.TWELVE_DATA_API_KEY || localStorage.getItem('API_KEY') || '';
if (TWELVE_DATA_API_KEY === 'PASTE_KEY_HERE') TWELVE_DATA_API_KEY = '';

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'ASML'];
const FREE_PLAN_LIMIT_PER_MIN = 8; // Conservative limit

const state = {
  watchlist: JSON.parse(localStorage.getItem('dashboard_watchlist')) || DEFAULT_WATCHLIST,
  autoRefreshInterval: parseInt(localStorage.getItem('dashboard_auto_refresh')) || 0,
  lastUpdated: null,
  marketStatus: 'Unknown',
  connectionStatus: 'Disconnected',
  refreshTimer: null,
  dataCache: {},
  timeSeriesCache: JSON.parse(localStorage.getItem('dashboard_ts_cache_v2')) || {},
  isLoading: false,
};

// Elements
const els = {
  tickerInput: document.getElementById('ticker-input'),
  addTickerBtn: document.getElementById('add-ticker-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  autoRefreshSelect: document.getElementById('auto-refresh-select'),
  marketStatus: document.getElementById('market-status'),
  connectionStatus: document.getElementById('connection-status'),
  lastUpdated: document.getElementById('last-updated'),
  watchlistBody: document.getElementById('watchlist-body'),
  errorMessage: document.getElementById('error-message'),
  apiKeyInput: document.getElementById('api-key-input'),
  saveKeyBtn: document.getElementById('save-key-btn'),
};

// Utils
const generateSparkline = (history, ticker) => {
  if (!history || history.length === 0) return '—';
  
  // Use last 30 days for the sparkline to make it look active
  const recentHistory = history.slice(-30);
  if (recentHistory.length === 0) return '—';

  const width = 100;
  const height = 30;
  const min = Math.min(...recentHistory);
  const max = Math.max(...recentHistory);
  const range = max - min || 1;

  const points = recentHistory.map((val, i) => {
    const x = (i / (recentHistory.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const isPositive = recentHistory[recentHistory.length - 1] >= recentHistory[0];
  const colorRGB = isPositive ? '40, 167, 69' : '220, 53, 69';
  const strokeColor = isPositive ? 'var(--success-color)' : 'var(--danger-color)';
  
  const gradId = `grad-${ticker}-${Math.random().toString(36).substr(2, 5)}`;

  return `
    <svg viewBox="0 -2 100 37" class="sparkline" style="width: 80px; height: 35px; overflow: visible;">
      <defs>
        <linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(${colorRGB}, 0.3)" />
          <stop offset="100%" stop-color="rgba(${colorRGB}, 0)" />
        </linearGradient>
      </defs>
      <polygon points="0,35 ${points} 100,35" fill="url(#${gradId})" />
      <polyline points="${points}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
};

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '—') return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

const formatPercent = (value) => {
  if (value === null || value === undefined || value === '—') return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

const getChangeClass = (value) => {
  if (value === null || value === undefined || value === '—') return '';
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return '';
  return num > 0 ? 'positive' : 'negative';
};

const showError = (msg) => {
  els.errorMessage.textContent = msg;
  els.errorMessage.classList.remove('hidden');
};

const hideError = () => {
  els.errorMessage.classList.add('hidden');
};

const setConnectionStatus = (status, type) => {
  els.connectionStatus.textContent = status;
  els.connectionStatus.className = `value status-${type}`;
};

// Cache mgmt
const cleanupTSCache = () => {
  const now = Date.now();
  const TTL = 12 * 60 * 60 * 1000; // 12 hours
  let updated = false;
  for (const sym in state.timeSeriesCache) {
    if (now - state.timeSeriesCache[sym].timestamp > TTL) {
      delete state.timeSeriesCache[sym];
      updated = true;
    }
  }
  if (updated) {
    localStorage.setItem('dashboard_ts_cache_v2', JSON.stringify(state.timeSeriesCache));
  }
};

// API calls
const fetchQuotes = async (symbols) => {
  if (!symbols || symbols.length === 0) return {};
  const url = `https://api.twelvedata.com/quote?symbol=${symbols.join(',')}&apikey=${TWELVE_DATA_API_KEY}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.code === 429) throw new Error('API Rate limit exceeded.');
    if (data.status === 'error') throw new Error(data.message || 'API Error');
    
    if (symbols.length === 1 && !data[symbols[0]]) {
      return { [symbols[0]]: data };
    }
    return data;
  } catch (error) {
    console.error('Fetch quotes error:', error);
    throw error;
  }
};

const fetchTimeSeries1Year = async (symbol) => {
  // Check cache
  if (state.timeSeriesCache[symbol]) {
    const cached = state.timeSeriesCache[symbol];
    if (Date.now() - cached.timestamp < 12 * 60 * 60 * 1000 && cached.data.history) {
      return cached.data;
    }
  }

  const outputsize = 253; // Approx trading days in a year for stocks
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=${outputsize}&apikey=${TWELVE_DATA_API_KEY}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.code === 429) throw new Error('API Rate limit exceeded.');
    if (data.status === 'error') throw new Error(data.message || 'API Error');
    
    if (data.values && data.values.length > 0) {
      const prices = data.values.map(v => parseFloat(v.close)).reverse(); // oldest to newest
      const result = {
        close1YrAgo: prices[0],
        history: prices
      };
      state.timeSeriesCache[symbol] = { timestamp: Date.now(), data: result };
      localStorage.setItem('dashboard_ts_cache_v2', JSON.stringify(state.timeSeriesCache));
      return result;
    }
    return null;
  } catch (error) {
    console.error(`Fetch TS error for ${symbol}:`, error);
    return null;
  }
};

// Data processing
const updateData = async () => {
  if (state.isLoading) return;
  if (!TWELVE_DATA_API_KEY) {
    showError('Please enter your Twelve Data API Key and click Save Key to start.');
    return;
  }

  state.isLoading = true;
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = 'Refreshing...';
  hideError();
  setConnectionStatus('Connecting...', 'warning');

  try {
    cleanupTSCache();
    
    let uncachedTS = 0;
    state.watchlist.forEach(sym => {
      if (!state.timeSeriesCache[sym] || (Date.now() - state.timeSeriesCache[sym].timestamp > 12*60*60*1000)) {
        uncachedTS++;
      }
    });

    const totalRequestsNeeded = 1 + uncachedTS;
    
    if (state.autoRefreshInterval > 0) {
      const requestsPerMin = totalRequestsNeeded * (60 / state.autoRefreshInterval);
      if (requestsPerMin > FREE_PLAN_LIMIT_PER_MIN) {
        state.autoRefreshInterval = 0;
        els.autoRefreshSelect.value = '0';
        localStorage.setItem('dashboard_auto_refresh', '0');
        setupAutoRefresh();
        showError(`Auto-refresh disabled: Your setup requires ~${Math.ceil(requestsPerMin)} req/min, exceeding the free tier limit. Please reduce watchlist size or refresh manually.`);
      }
    }

    if (totalRequestsNeeded > FREE_PLAN_LIMIT_PER_MIN) {
      showError(`Warning: Fetching ${state.watchlist.length} symbols may hit rate limits. Using cache for historical data...`);
    }

    const quotes = await fetchQuotes(state.watchlist);
    setConnectionStatus('Connected', 'ok');
    state.lastUpdated = new Date();
    els.lastUpdated.textContent = state.lastUpdated.toLocaleTimeString();

    let mktOpen = false;
    for(const sym in quotes) {
       if(quotes[sym].is_market_open) { mktOpen = true; }
    }
    els.marketStatus.textContent = mktOpen ? 'Open' : 'Closed';
    els.marketStatus.className = `value status-${mktOpen ? 'ok' : 'warning'}`;

    for (const symbol of state.watchlist) {
      const quoteData = quotes[symbol];
      
      let tsData = null;
      if (quoteData) {
        tsData = await fetchTimeSeries1Year(symbol);
      }

      if (quoteData) {
        let yearReturn = '—';
        let yearChange = '—';
        if (tsData && tsData.close1YrAgo) {
            const currentPrice = parseFloat(quoteData.close);
            const pastPrice = tsData.close1YrAgo;
            yearChange = currentPrice - pastPrice;
            yearReturn = (yearChange / pastPrice) * 100;
        }

        const high52 = (quoteData.fifty_two_week && quoteData.fifty_two_week.high) ? quoteData.fifty_two_week.high : '—';
        const low52 = (quoteData.fifty_two_week && quoteData.fifty_two_week.low) ? quoteData.fifty_two_week.low : '—';

        state.dataCache[symbol] = {
          ticker: symbol,
          name: quoteData.name || symbol,
          price: quoteData.close,
          change: quoteData.change,
          changePercent: quoteData.percent_change,
          yearChange: yearChange,
          yearReturn: yearReturn,
          history: tsData ? tsData.history : null,
          high52: high52,
          low52: low52
        };
      }
    }

    renderTable();

  } catch (err) {
    console.error(err);
    showError(err.message || 'Failed to fetch data.');
    setConnectionStatus('Error', 'error');
  } finally {
    state.isLoading = false;
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = 'Refresh Now';
  }
};

// UI Rendering
const renderTable = () => {
  els.watchlistBody.innerHTML = '';
  
  if (state.watchlist.length === 0) {
    els.watchlistBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-secondary); padding: 30px;">Watchlist is empty. Add a ticker to get started.</td></tr>`;
    return;
  }

  state.watchlist.forEach(symbol => {
    const data = state.dataCache[symbol];
    const tr = document.createElement('tr');
    
    if (!data) {
      tr.innerHTML = `
        <td><div class="ticker-symbol">${symbol}</div></td>
        <td><div class="ticker-name">—</div></td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td><button class="btn btn-danger remove-btn" data-symbol="${symbol}">Remove</button></td>
      `;
    } else {
      tr.innerHTML = `
        <td><div class="ticker-symbol"><a href="details.html?symbol=${data.ticker}" style="color: inherit; text-decoration: none;" class="hover-underline">${data.ticker}</a></div></td>
        <td><div class="ticker-name" title="${data.name}"><a href="details.html?symbol=${data.ticker}" style="color: inherit; text-decoration: none;" class="hover-underline">${data.name}</a></div></td>
        <td>${formatCurrency(data.price)}</td>
        <td class="${getChangeClass(data.change)}">${formatCurrency(data.change)}</td>
        <td class="${getChangeClass(data.changePercent)}">${formatPercent(data.changePercent)}</td>
        <td class="${getChangeClass(data.yearChange)}">${formatCurrency(data.yearChange)}</td>
        <td class="${getChangeClass(data.yearReturn)}">${formatPercent(data.yearReturn)}</td>
        <td>${generateSparkline(data.history, data.ticker)}</td>
        <td>${formatCurrency(data.high52)}</td>
        <td>${formatCurrency(data.low52)}</td>
        <td><button class="btn btn-danger remove-btn" data-symbol="${data.ticker}">Remove</button></td>
      `;
    }
    
    els.watchlistBody.appendChild(tr);
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      removeTicker(e.target.dataset.symbol);
    });
  });
};

// Actions
const addTicker = () => {
  let val = els.tickerInput.value.trim().toUpperCase();
  if (!val) return;
  
  if (state.watchlist.includes(val)) {
    showError(`${val} is already in the watchlist.`);
    return;
  }

  state.watchlist.push(val);
  localStorage.setItem('dashboard_watchlist', JSON.stringify(state.watchlist));
  els.tickerInput.value = '';
  renderTable();
  updateData();
};

const removeTicker = (symbol) => {
  state.watchlist = state.watchlist.filter(s => s !== symbol);
  localStorage.setItem('dashboard_watchlist', JSON.stringify(state.watchlist));
  delete state.dataCache[symbol];
  renderTable();
};

const setupAutoRefresh = () => {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
  
  if (state.autoRefreshInterval > 0) {
    state.refreshTimer = setInterval(updateData, state.autoRefreshInterval * 1000);
  }
};

// Event Listeners
els.addTickerBtn.addEventListener('click', addTicker);
els.tickerInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addTicker();
});

els.refreshBtn.addEventListener('click', updateData);

els.autoRefreshSelect.addEventListener('change', (e) => {
  state.autoRefreshInterval = parseInt(e.target.value);
  localStorage.setItem('dashboard_auto_refresh', state.autoRefreshInterval.toString());
  setupAutoRefresh();
});

els.saveKeyBtn.addEventListener('click', () => {
  const key = els.apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem('API_KEY', key);
    TWELVE_DATA_API_KEY = key;
    hideError();
    updateData();
  } else {
    localStorage.removeItem('API_KEY');
    TWELVE_DATA_API_KEY = '';
  }
});

// Init
const init = () => {
  els.apiKeyInput.value = TWELVE_DATA_API_KEY;
  els.autoRefreshSelect.value = state.autoRefreshInterval.toString();
  renderTable();
  setupAutoRefresh();
  updateData();
};

init();
