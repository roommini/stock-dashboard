# Stock Dashboard

A single-page Stock Dashboard using vanilla HTML, CSS, and JavaScript.

## Features
- Real-time stock quotes via Twelve Data API
- **Interactive Charts**: Click on any ticker to view detailed company profiles and interactive line charts (from 1D up to 10Y timeframes) powered by Chart.js.
- **Smart Market-Closed Cache**: The dashboard automatically detects when the US stock market is closed. It then caches all price data locally in the browser for 30 minutes. This completely prevents rate-limit bans (Twelve Data limits to 8 req/min) on weekends or nights, meaning you can leave auto-refresh turned on indefinitely during off-hours.
- No build step, no NPM required
- Watchlist stored in local storage
- Configurable auto-refresh limits

## Setup & Run
1. Open `index.html` in your web browser.
2. Enter your [Twelve Data API Key](https://twelvedata.com/) in the top right corner of the application to start fetching data.
3. Add your favorite stock tickers.

## Deployment (Vercel / GitHub Pages)
This project is 100% static frontend. You can deploy it directly to Vercel, GitHub Pages, or Netlify without any configuration.
- Push the repository to GitHub.
- Import the repository in Vercel.
- Done! The API key can be safely entered by the user in the browser when they visit your Vercel URL.
