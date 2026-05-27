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
  const canvas = document.getElementById('price-chart');
  
  loader.classList.remove('hidden');
  canvas.style.opacity = '0.5';
  hideError();

  const settings = TF_SETTINGS[tf];
  const cacheKey = `chart_${symbol}_${tf}`;
  let tsData = getCache(cacheKey);

  if (!tsData) {
    try {
      const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${settings.interval}&outputsize=${settings.outputsize}&apikey=${TWELVE_DATA_API_KEY}`);
      const data = await res.json();
      
      if (data.code === 429) throw new Error('API Rate limit exceeded. Please wait a minute and try again.');
      if (data.status === 'error') throw new Error(data.message);
      if (!data.values) throw new Error('No chart data available for this timeframe.');
      
      tsData = data.values.reverse(); // oldest to newest
      setCache(cacheKey, tsData);
    } catch (e) {
      showError('Chart error: ' + e.message);
      loader.classList.add('hidden');
      canvas.style.opacity = '1';
      return;
    }
  }

  renderChart(tsData, tf);
  loader.classList.add('hidden');
  canvas.style.opacity = '1';
};

const renderChart = (data, tf) => {
  const ctx = document.getElementById('price-chart').getContext('2d');
  
  const labels = data.map(d => {
    const date = new Date(d.datetime);
    if (['1D', '5D'].includes(tf)) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString();
  });
  
  const prices = data.map(d => parseFloat(d.close));
  
  const isPositive = prices[prices.length - 1] >= prices[0];
  const color = isPositive ? '#28a745' : '#dc3545';
  const bgGradient = ctx.createLinearGradient(0, 0, 0, 400);
  bgGradient.addColorStop(0, isPositive ? 'rgba(40,167,69,0.2)' : 'rgba(220,53,69,0.2)');
  bgGradient.addColorStop(1, 'rgba(0,0,0,0)');

  if (chartInstance) {
    chartInstance.destroy();
  }

  Chart.defaults.color = '#a0aabc';
  Chart.defaults.font.family = "'Inter', sans-serif";

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Close Price',
        data: prices,
        borderColor: color,
        backgroundColor: bgGradient,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2229',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: '#2d333b',
          borderWidth: 1,
          displayColors: false,
          callbacks: {
            label: (ctx) => formatCurrency(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#2d333b', drawBorder: false },
          ticks: { maxTicksLimit: 8 }
        },
        y: {
          grid: { color: '#2d333b', drawBorder: false },
          ticks: {
            callback: (val) => '$' + val
          }
        }
      }
    }
  });
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
