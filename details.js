const urlParams = new URLSearchParams(window.location.search);
const symbol = urlParams.get('symbol');

const TWELVE_DATA_API_KEY = localStorage.getItem('API_KEY') || '';

if (!symbol || !TWELVE_DATA_API_KEY) {
  window.location.href = 'index.html';
}

document.title = `${symbol} - Company Details`;
document.getElementById('ticker-symbol').textContent = symbol;

let chartInstance = null;

const formatCurrency = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

const formatPercent = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

const showError = (msg) => {
  const errEl = document.getElementById('error-message');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
};

const hideError = () => {
  document.getElementById('error-message').classList.add('hidden');
};

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

const getCache = (key) => {
  const cached = localStorage.getItem(key);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < CACHE_TTL) {
      return parsed.data;
    }
  }
  return null;
};

const setCache = (key, data) => {
  localStorage.setItem(key, JSON.stringify({
    timestamp: Date.now(),
    data: data
  }));
};

// Fetch Quote
const loadQuote = async () => {
  try {
    const res = await fetch(`https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${TWELVE_DATA_API_KEY}`);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message);
    
    document.getElementById('company-name').textContent = data.name;
    document.getElementById('live-price').textContent = formatCurrency(data.close);
    
    const changeEl = document.getElementById('live-change');
    const change = parseFloat(data.change);
    changeEl.textContent = `${formatCurrency(data.change)} (${formatPercent(data.percent_change)})`;
    changeEl.style.color = change >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
  } catch (e) {
    showError('Failed to load live price: ' + e.message);
  }
};

// Fetch Profile
const loadProfile = async () => {
  const cacheKey = `profile_${symbol}`;
  const cached = getCache(cacheKey);
  
  if (cached) {
    renderProfile(cached);
    return;
  }

  try {
    const res = await fetch(`https://api.twelvedata.com/profile?symbol=${symbol}&apikey=${TWELVE_DATA_API_KEY}`);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message);
    
    setCache(cacheKey, data);
    renderProfile(data);
  } catch (e) {
    document.getElementById('profile-loader').textContent = 'Profile data not available on free tier for some symbols.';
  }
};

const renderProfile = (data) => {
  document.getElementById('profile-loader').classList.add('hidden');
  document.getElementById('profile-content').classList.remove('hidden');
  
  document.getElementById('profile-desc').textContent = data.description || 'No description available.';
  document.getElementById('prof-sector').textContent = data.sector || '—';
  document.getElementById('prof-industry').textContent = data.industry || '—';
  document.getElementById('prof-employees').textContent = data.employees ? parseInt(data.employees).toLocaleString() : '—';
  document.getElementById('prof-exchange').textContent = data.exchange || '—';
  
  const location = [data.city, data.state, data.country].filter(Boolean).join(', ');
  document.getElementById('prof-location').textContent = location || '—';
  
  const webEl = document.getElementById('prof-website');
  if (data.website) {
    webEl.href = data.website;
    webEl.textContent = data.website.replace(/^https?:\/\//, '');
  } else {
    webEl.textContent = '—';
    webEl.removeAttribute('href');
  }
};

// Time Series Settings
const TF_SETTINGS = {
  '1D': { interval: '5min', outputsize: 78 },
  '5D': { interval: '30min', outputsize: 65 },
  '1M': { interval: '1day', outputsize: 22 },
  '6M': { interval: '1day', outputsize: 130 },
  '1Y': { interval: '1day', outputsize: 253 },
  '5Y': { interval: '1week', outputsize: 260 },
  '10Y': { interval: '1month', outputsize: 120 },
};

const loadChart = async (tf) => {
  const loader = document.getElementById('chart-loader');
  const container = document.getElementById('chart-container-div');
  
  loader.classList.remove('hidden');
  if (container) container.style.opacity = '0.5';
  hideError();

  const settings = TF_SETTINGS[tf];
  const cacheKey = `chart_tv_${symbol}_${tf}`;
  let tsData = getCache(cacheKey);

  if (!tsData) {
    try {
      const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${settings.interval}&outputsize=${settings.outputsize}&apikey=${TWELVE_DATA_API_KEY}`);
      const data = await res.json();
      
      if (data.code === 429) throw new Error('API Rate limit exceeded. Please wait a minute and try again.');
      if (data.status === 'error') throw new Error(data.message);
      if (!data.values) throw new Error('No chart data available for this timeframe.');
      
      tsData = data.values.reverse().map(d => {
        // Convert 'YYYY-MM-DD HH:MM:SS' to local timestamp in seconds
        const dt = new Date(d.datetime);
        return {
          time: Math.floor(dt.getTime() / 1000),
          open: parseFloat(d.open),
          high: parseFloat(d.high),
          low: parseFloat(d.low),
          close: parseFloat(d.close)
        };
      });
      setCache(cacheKey, tsData);
    } catch (e) {
      showError('Chart error: ' + e.message);
      loader.classList.add('hidden');
      if (container) container.style.opacity = '1';
      return;
    }
  }

  renderChart(tsData, tf);
  loader.classList.add('hidden');
  if (container) container.style.opacity = '1';
};

const renderChart = (data, tf) => {
  const container = document.getElementById('chart-container-div');
  
  if (chartInstance) {
    chartInstance.remove();
    chartInstance = null;
  }
  
  container.innerHTML = '';

  const chartOptions = { 
    layout: { 
      textColor: '#a0aabc', 
      background: { type: 'solid', color: 'transparent' } 
    },
    grid: {
      vertLines: { color: '#2d333b' },
      horzLines: { color: '#2d333b' }
    },
    timeScale: {
      timeVisible: ['1D', '5D'].includes(tf),
      secondsVisible: false,
    },
    rightPriceScale: {
      borderVisible: false,
    }
  };
  
  chartInstance = LightweightCharts.createChart(container, chartOptions);
  
  // Resize handler
  new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) return;
    const newRect = entries[0].contentRect;
    chartInstance.applyOptions({ height: newRect.height, width: newRect.width });
  }).observe(container);

  if (tf === '1D') {
    const series = chartInstance.addCandlestickSeries({
      upColor: '#28a745', 
      downColor: '#dc3545', 
      borderVisible: false,
      wickUpColor: '#28a745', 
      wickDownColor: '#dc3545',
    });
    series.setData(data);

    // Calculate Support (Lowest Low) and Demand/Resistance (Highest High)
    let minLow = Infinity;
    let maxHigh = -Infinity;
    data.forEach(d => {
      if (d.low < minLow) minLow = d.low;
      if (d.high > maxHigh) maxHigh = d.high;
    });

    if (data.length > 0) {
      series.createPriceLine({
        price: maxHigh,
        color: '#dc3545',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Resistance (Supply)',
      });

      series.createPriceLine({
        price: minLow,
        color: '#28a745',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Support (Demand)',
      });
    }
  } else {
    // Other timeframes: Area Chart
    const isPositive = data[data.length - 1].close >= data[0].close;
    const color = isPositive ? '#28a745' : '#dc3545';
    const series = chartInstance.addAreaSeries({
      lineColor: color,
      topColor: isPositive ? 'rgba(40,167,69,0.4)' : 'rgba(220,53,69,0.4)',
      bottomColor: 'rgba(0,0,0,0)',
      lineWidth: 2,
    });
    
    const lineData = data.map(d => ({ time: d.time, value: d.close }));
    series.setData(lineData);
  }
  
  chartInstance.timeScale().fitContent();
};

// Events
document.querySelectorAll('.tf-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    loadChart(e.target.dataset.tf);
  });
});

// Init
loadQuote();
loadProfile();
loadChart('1M');
