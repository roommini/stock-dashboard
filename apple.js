const symbol = 'AAPL';

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

// Load TradingView Widgets
const loadTVWidget = (containerId, scriptUrl, config) => {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  
  const innerDiv = document.createElement('div');
  innerDiv.className = "tradingview-widget-container__widget";
  
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = scriptUrl;
  script.async = true;
  script.innerHTML = JSON.stringify(config);
  
  const wrapper = document.createElement('div');
  wrapper.className = "tradingview-widget-container";
  wrapper.style.height = "100%";
  wrapper.style.width = "100%";
  
  wrapper.appendChild(innerDiv);
  wrapper.appendChild(script);
  container.appendChild(wrapper);
};

const loadTradingViewData = () => {
  loadTVWidget('tv-profile-container', 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-profile.js', {
    "width": "100%",
    "height": "100%",
    "colorTheme": "dark",
    "isTransparent": true,
    "symbol": symbol,
    "locale": "en"
  });

  loadTVWidget('tv-financials-container', 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js', {
    "colorTheme": "dark",
    "isTransparent": true,
    "largeChartUrl": "",
    "displayMode": "regular",
    "width": "100%",
    "height": "100%",
    "symbol": symbol,
    "locale": "th_TH"
  });
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
  'Indicator': { interval: '5min', outputsize: 390 } // 5 days of history
};

const loadChart = async (tf) => {
  const loader = document.getElementById('chart-loader');
  const container = document.getElementById('chart-container-div');
  
  loader.classList.remove('hidden');
  if (container) container.style.opacity = '0.5';
  hideError();

  const settings = TF_SETTINGS[tf];
  const cacheKey = `chart_v3_${symbol}_${tf}`;
  let tsData = getCache(cacheKey);

  if (!tsData) {
    try {
      const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${settings.interval}&outputsize=${settings.outputsize}&apikey=${TWELVE_DATA_API_KEY}`);
      const data = await res.json();
      
      if (data.code === 429) throw new Error('API Rate limit exceeded. Please wait a minute and try again.');
      if (data.status === 'error') throw new Error(data.message);
      if (!data.values) throw new Error('No chart data available for this timeframe.');
      
      const seen = new Set();
      tsData = data.values.reverse().map(d => {
        const dt = new Date(d.datetime);
        return {
          time: Math.floor(dt.getTime() / 1000),
          open: parseFloat(d.open),
          high: parseFloat(d.high),
          low: parseFloat(d.low),
          close: parseFloat(d.close)
        };
      }).filter(d => {
        if (seen.has(d.time)) return false;
        seen.add(d.time);
        return true;
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

const renderChart = async (data, tf) => {
  try {
    if (typeof LightweightCharts === 'undefined') {
      throw new Error('TradingView library failed to load. Please check your internet connection.');
    }
    
    if (!data || data.length === 0) {
      throw new Error('No chart data available to render.');
    }

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
      timeVisible: ['1D', '5D', 'Indicator'].includes(tf),
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

  let series;
  if (tf === 'Indicator') {
    series = chartInstance.addCandlestickSeries({
      upColor: '#28a745', 
      downColor: '#dc3545', 
      borderVisible: false,
      wickUpColor: '#28a745', 
      wickDownColor: '#dc3545',
    });
    series.setData(data);

    // Calculate Support (Lowest Low) and Demand/Resistance (Highest High) for the LATEST DAY only
    let minLow = Infinity;
    let maxHigh = -Infinity;
    if (data.length > 0) {
      const lastDate = new Date(data[data.length - 1].time * 1000).toLocaleDateString();
      data.forEach(d => {
        const dDate = new Date(d.time * 1000).toLocaleDateString();
        if (dDate === lastDate) {
          if (d.low < minLow) minLow = d.low;
          if (d.high > maxHigh) maxHigh = d.high;
        }
      });
    }

    if (data.length > 0) {
      series.createPriceLine({
        price: maxHigh,
        color: '#dc3545',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Resistance',
      });

      series.createPriceLine({
        price: minLow,
        color: '#28a745',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Support',
      });
    }
  } else {
    // Other timeframes: Area Chart
    const isPositive = data[data.length - 1].close >= data[0].close;
    const color = isPositive ? '#28a745' : '#dc3545';
    series = chartInstance.addAreaSeries({
      lineColor: color,
      topColor: isPositive ? 'rgba(40,167,69,0.4)' : 'rgba(220,53,69,0.4)',
      bottomColor: 'rgba(0,0,0,0)',
      lineWidth: 2,
    });
    
    const lineData = data.map(d => ({ time: d.time, value: d.close }));
    series.setData(lineData);
  }
  
  // --- Fetch Events from Vercel Backend ---
  try {
    const res = await fetch(`/api/events?symbol=${symbol}`);
    if (res.ok) {
      const dbEvents = await res.json();
      if (dbEvents && dbEvents.length > 0) {
        const markers = [];
        dbEvents.forEach(evt => {
          // Find matching date in the chart data
          const match = data.find(d => {
            const dDate = new Date(d.time * 1000).toISOString().split('T')[0];
            return dDate === evt.date;
          });
          
          if (match) {
            markers.push({
              time: match.time,
              position: evt.position || 'belowBar',
              color: evt.color || '#2962FF',
              textColor: evt.textColor || '#ffffff',
              shape: evt.shape || 'arrowUp',
              text: evt.text,
              size: 2
            });
          }
        });

        if (markers.length > 0) {
          markers.sort((a, b) => a.time - b.time);
          series.setMarkers(markers);
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch events from backend:', err);
  }
  // ---------------------------------------

  chartInstance.timeScale().fitContent();

  } catch (err) {
    showError('Render Error: ' + err.message);
    console.error(err);
    throw err;
  }
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
loadTradingViewData();
loadChart('Indicator');
