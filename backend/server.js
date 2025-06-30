// server.js

// -------------------- IMPORTS --------------------
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('./models/User');
const fetch = require("node-fetch");
const Portfolio = require('./models/Portfolio');
const nodemailer = require('nodemailer');
const Settings = require('./models/Settings');
require("dotenv").config();

//deneme2


// -------------------- CONFIG --------------------
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/ihapp';

// -------------------- DATABASE CONNECTION --------------------
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// -------------------- AUTH ENDPOINTS --------------------

// Register
const tempUsers = {};

app.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000);

    // Hash the password (temporary storage)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Temporary user storage in memory (could be replaced with Redis or similar storage)
    tempUsers[email] = {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      verificationCode,
    };

    // Nodemailer Configuration
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // Sender email address
        pass: process.env.EMAIL_PASS, // App password or email password
      },
    });

    // Email Options
    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address
      to: email, // Recipient address
      subject: 'Verify Your Email',
      text: `Hello ${firstName},\n\nYour verification code is: ${verificationCode}\n\nThank you!`,
    };

    // Send Email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({ message: 'Error sending email', error });
      }
      console.log('Email sent:', info.response);
      res.status(200).json({ message: 'Verification email sent successfully.' });
    });
  } catch (err) {
    console.error("Error processing registration:", err.message);
    res.status(500).json({ message: 'Error processing registration', error: err.message });
  }
});

app.post('/verify', async (req, res) => {
  try {
    const { email, verificationCode } = req.body;

    // Check if the user exists in temp storage
    const tempUser = tempUsers[email];
    if (!tempUser) {
      return res.status(400).json({ message: 'Verification expired or invalid email.' });
    }

    // Check if verification code matches
    if (tempUser.verificationCode !== parseInt(verificationCode, 10)) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    // Create user in the database
    const newUser = new User({
      firstName: tempUser.firstName,
      lastName: tempUser.lastName,
      email: tempUser.email,
      password: tempUser.password,
      isVerified: true,
    });

    await newUser.save();

    // Remove the user from temporary storage
    delete tempUsers[email];

    res.status(201).json({ message: 'User verified and registered successfully.' });
  } catch (err) {
    console.error("Error verifying user:", err.message);
    res.status(500).json({ message: 'Error verifying user', error: err.message });
  }
});



// Login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    // Check if user exists
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Create token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || 'secretkey',
      { expiresIn: '1h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    });

  } catch (err) {
    res.status(500).json({ message: 'Error logging in', error: err.message });
  }
});


 
  



// -------------------- CRYPTO DATA FETCHING --------------------
let cachedCryptoData = [];
let cachedTrendingData = [];
let cachedExchangesData = [];
let lastFetchTime = null;
let recentlyTriggered = new Map(); // { userId => [ { coin, message, currentPrice, timestamp } ] }

const fetchCryptoData = async () => {
  try {
    const symbols = [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT',
      'DOGEUSDT', 'MATICUSDT', 'SOLUSDT', 'DOTUSDT', 'SHIBUSDT',
      'TRXUSDT', 'LTCUSDT', 'LINKUSDT', 'AVAXUSDT', 'UNIUSDT',
      'ATOMUSDT', 'ETCUSDT', 'XLMUSDT', 'BCHUSDT', 'APTUSDT',
      'APEUSDT', 'FILUSDT', 'NEARUSDT', 'QNTUSDT', 'AAVEUSDT',
      'AXSUSDT', 'SANDUSDT', 'VETUSDT', 'EGLDUSDT', 'EOSUSDT'
    ];

    const responses = await Promise.all(
      symbols.map((symbol) =>
        axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`)
      )
    );

    cachedCryptoData = responses.map((response) => ({
      symbol: response.data.symbol.replace('USDT', ''),
      price: parseFloat(response.data.lastPrice),
      dailyChange: parseFloat(response.data.priceChangePercent),
      volume: parseFloat(response.data.volume),
      highPrice: parseFloat(response.data.highPrice),
      lowPrice: parseFloat(response.data.lowPrice),
      weeklyChange: 0,
      monthlyChange: 0,
    }));

    for (let coin of cachedCryptoData) {
      const binanceSymbol = coin.symbol + 'USDT';
      try {
        coin.weeklyChange = await fetchWeeklyChange(binanceSymbol);
        coin.monthlyChange = await fetchMonthlyChange(binanceSymbol);
      } catch (error) {
        console.error(`Failed to fetch weekly/monthly for ${binanceSymbol}`, error.message);
      }
    }

    // 🔔 Eşik kontrolü
const settingsList = await Settings.find({});
for (const settings of settingsList) {
  const alerts = [];
  const { userId, priceAlerts } = settings;
  if (!priceAlerts) continue;

  const notifiedCoins = settings.notifiedCoins || new Map();

  for (const coin of cachedCryptoData) {
    const symbol = coin.symbol;
    const alert = priceAlerts.get(symbol);
    const alreadyNotified = notifiedCoins.get(symbol);

    if (!alert || alreadyNotified) continue;

    const currentPrice = coin.price;
    const min = alert.min ?? 0;
    const max = alert.max ?? Infinity;
    let message = "";
    let triggered = false;

    if (currentPrice < min) {
      message = `${symbol} price dropped below $${min}`;
      triggered = true;
    } else if (currentPrice > max) {
      message = `${symbol} price exceeded $${max}`;
      triggered = true;
    }

    if (triggered) {
      alerts.push({
        coin: symbol,
        currentPrice,
        message,
        timestamp: new Date(),
      });
      console.log(`[ALERT] ${symbol} for user ${userId}: ${message} (current: ${currentPrice})`);

      // 🔒 notifiedCoins'e ekle
      notifiedCoins.set(symbol, true);
    }
  }

  if (alerts.length > 0) {
    recentlyTriggered.set(userId.toString(), alerts);

    // Map güncellendiği için kaydet
    settings.notifiedCoins = notifiedCoins;
    settings.markModified('notifiedCoins');
    await settings.save();
  }
}

    

    console.log('Crypto data fetched successfully for 30 symbols.');
  } catch (error) {
    console.error('Error fetching crypto data:', error.message);
  }
};

// 🔄 Kullanıcının tetiklenen geçici bildirimlerini getir
app.get('/triggered-alerts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[GET /triggered-alerts] userId: ${userId}`);

    const data = recentlyTriggered.get(userId) || [];
    console.log(`[GET /triggered-alerts] Sending alerts:`, data);
    recentlyTriggered.delete(userId); // Bildirimi sadece bir kez göster

    return res.status(200).json(data);
  } catch (err) {
    console.error('[GET /triggered-alerts] Error:', err.message);
    return res.status(500).json({ message: 'Failed to fetch triggered alerts', error: err.message });
  }
});



// Bildirimi temizleme (coin düzeyinde)
app.delete('/triggered-alerts/:userId/:coin', async (req, res) => {
  try {
    const { userId, coin } = req.params;
    const settings = await Settings.findOne({ userId });

    if (!settings) return res.status(404).json({ message: 'Settings not found' });

    settings.notifiedCoins?.set(coin, false);  // bildirimi pasifleştir
    settings.markModified('notifiedCoins');
    await settings.save();

    return res.status(200).json({ message: `Alert for ${coin} removed.` });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove alert', error: err.message });
  }
});
// --------------------------------------------------------
// PART 2: Add or replace endpoints for multi-timeframe
// Insert around line ~290 or so, near your other CRYPTO endpoints.
// --------------------------------------------------------


// ---------------------------------------------------------------------
// NEW: /gainers endpoint with "rename" logic for coin.change
// ---------------------------------------------------------------------
app.get('/gainers', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || 'daily';

    let sortField;
    if (timeframe === 'weekly') {
      sortField = 'weeklyChange';
    } else if (timeframe === 'monthly') {
      sortField = 'monthlyChange';
    } else {
      // default daily
      sortField = 'dailyChange';
    }

    // Sort the coins DESCENDING by the chosen field
    const sorted = [...cachedCryptoData].sort((a, b) => b[sortField] - a[sortField]);

    // Grab top 5
    const top5Gainers = sorted.slice(0, 5);

    // Rename the correct timeframe field into coin.change (for the front-end)
    top5Gainers.forEach((coin) => {
      coin.change = coin[sortField]; 
      // e.g. coin.change = coin.dailyChange if timeframe='daily'
      // coin.change = coin.weeklyChange if 'weekly'
      // coin.change = coin.monthlyChange if 'monthly'
    });

    return res.json({
      timeframe,
      data: top5Gainers,
    });
  } catch (error) {
    console.error('Error in /gainers:', error.message);
    return res.status(500).json({ message: 'Failed to get gainers' });
  }
});


app.get('/losers', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || 'daily';

    let sortField;
    if (timeframe === 'weekly') {
      sortField = 'weeklyChange';
    } else if (timeframe === 'monthly') {
      sortField = 'monthlyChange';
    } else {
      // default daily
      sortField = 'dailyChange';
    }

    // Sort ascending
    const sorted = [...cachedCryptoData].sort((a, b) => a[sortField] - b[sortField]);
    const top5Losers = sorted.slice(0, 5);

    top5Losers.forEach((coin) => {
      coin.change = coin[sortField];
    });

    return res.json({
      timeframe,
      data: top5Losers,
    });
  } catch (error) {
    console.error('Error in /losers:', error.message);
    return res.status(500).json({ message: 'Failed to get losers' });
  }
});



// This version sorts the 30 coins by 24hr change (descending) and picks top 5
const fetchTrendingCoins = async () => {
  try {
    // Make sure we have some data in cachedCryptoData
    // If it's empty, fetch it once:
    if (!cachedCryptoData || !cachedCryptoData.length) {
      await fetchCryptoData(); // This fetches all 30 coins
    }
    
    // Sort them by 'change' descending and take top 5
    const sortedByGainers = [...cachedCryptoData].sort((a, b) => b.change - a.change);
    cachedTrendingData = sortedByGainers.slice(0, 5);

  } catch (error) {
    console.error('Error fetching trending coins:', error.message);
  }
};


// Fetch top exchanges (static data for now)
const fetchTopExchanges = async () => {
  cachedExchangesData = [
    { rank: 1, exchange: 'Binance', volume: '$20B', change: '2.1%' },
    { rank: 2, exchange: 'Coinbase', volume: '$12B', change: '1.5%' },
    { rank: 3, exchange: 'Kraken', volume: '$8B', change: '0.8%' },
    { rank: 4, exchange: 'Bitfinex', volume: '$5B', change: '-1.2%' },
    { rank: 5, exchange: 'KuCoin', volume: '$4B', change: '0.5%' },
  ];
};

// Initial data fetch
const fetchAllData = async () => {
  await fetchCryptoData();
  await fetchTrendingCoins();
  await fetchTopExchanges();
  lastFetchTime = new Date();
};

fetchAllData();
setInterval(async () => {
  console.log("⏱️ Refreshing crypto data...");
  await fetchCryptoData();
  lastFetchTime = new Date();
}, 15000); // 15000 ms = 15 saniye

// -------------------- CRYPTO ENDPOINTS --------------------
app.get('/crypto-data', async (req, res) => {
  if (!cachedCryptoData || cachedCryptoData.length === 0) {
    console.log('Fetching data as cache is empty...');
    await fetchCryptoData();
  }
  try {
    const data = await Promise.all(
      cachedCryptoData.map(async (coin) => {
        const binanceSymbol = `${coin.symbol}USDT`;

        // Fetch historical data for different timeframes
        const last1Hour = await fetchHistoricalData(binanceSymbol, "1m", 60); // 60 one-minute candles
        const last24Hours = await fetchHistoricalData(binanceSymbol, "1h", 24); // 24 one-hour candles
        const last7Days = await fetchHistoricalData(binanceSymbol, "1d", 7);    // 7 daily candles
        const last30Days = await fetchHistoricalData(binanceSymbol, "1d", 30);  // 30 daily candles

        // Helper function to calculate high/low and change
        const calculateHighLow = (data) => {
          if (!data || data.length === 0) {
            console.error('No data available for high/low calculation');
            return { high: 0, low: 0, change: 0 };
          }
          const prices = data.map((d) => d.price);
          const high = Math.max(...prices);
          const low = Math.min(...prices);
          const initialPrice = prices[0]; // Price at the beginning of the timeframe
          const currentPrice = prices[prices.length - 1]; // Most recent price
          const change = ((currentPrice - initialPrice) / initialPrice) * 100;
          return { high, low, change };
        };

        // Calculate high/low and change for each timeframe
        
        const hourlyHighLow = calculateHighLow(last1Hour); // Last 24 hours
        const dailyHighLow = calculateHighLow(last24Hours);
        const weeklyHighLow = calculateHighLow(last7Days);
        const monthlyHighLow = calculateHighLow(last30Days);

        return {
          ...coin,
          hourlyHigh: hourlyHighLow.high,
          hourlyLow: hourlyHighLow.low,
          hourlyChange: hourlyHighLow.change,
          dailyHigh: dailyHighLow.high,
          dailyLow: dailyHighLow.low,
          dailyChange: dailyHighLow.change,
          weeklyHigh: weeklyHighLow.high,
          weeklyLow: weeklyHighLow.low,
          weeklyChange: weeklyHighLow.change,
          monthlyHigh: monthlyHighLow.high,
          monthlyLow: monthlyHighLow.low,
          monthlyChange: monthlyHighLow.change,
        };
      })
    );

    res.json({ data, lastUpdated: lastFetchTime });
  } catch (error) {
    console.error('Error fetching crypto data:', error.message);
    res.status(500).json({ message: 'Failed to fetch data' });
  }
});




app.get('/top-exchanges', (req, res) => {
  res.json({ data: cachedExchangesData });
});

// Manually refresh data
app.get('/refresh-data', async (req, res) => {
  await fetchAllData();
  res.json({ message: 'Data refreshed successfully.' });
});

// This will take our 30 cached coins and pick the 5 with the *lowest* (most negative) daily change
const fetchTopLosers = async () => {
  try {
    // If we haven't fetched the 30 coins yet, do so:
    if (!cachedCryptoData || !cachedCryptoData.length) {
      await fetchCryptoData();
    }

    // Sort ascending by % change:
    const sorted = [...cachedCryptoData].sort((a, b) => a.change - b.change);

    // Take the first 5 (these will be the biggest losers):
    cachedTopLosersData = sorted.slice(0, 5);
  } catch (error) {
    console.error('Error in fetchTopLosers:', error.message);
  }
};

async function fetchWeeklyChange(symbol) {
  try {
    // Get 8 daily candles so we have 7 intervals
    // (because we need the price from day0 close and day7 close)
    const limit = 8; 
    const interval = '1d';

    const response = await axios.get(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );

    const klines = response.data; 
    if (klines.length < 2) {
      return 0; // Not enough data to compute weekly change
    }

    // First candle's close price
    const firstClose = parseFloat(klines[0][4]);
    // Last candle's close price (7 days later)
    const lastClose = parseFloat(klines[klines.length - 1][4]);

    // Calculate % change
    const weeklyChange = ((lastClose - firstClose) / firstClose) * 100;
    return weeklyChange;
  } catch (error) {
    console.error(`Error fetching weekly change for ${symbol}:`, error.message);
    return 0;
  }
}


async function fetchMonthlyChange(symbol) {
  try {
    // For 30 days, we fetch 31 daily candles
    const limit = 31; 
    const interval = '1d';

    const response = await axios.get(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );

    const klines = response.data; 
    if (klines.length < 2) {
      return 0;
    }

    const firstClose = parseFloat(klines[0][4]);
    const lastClose = parseFloat(klines[klines.length - 1][4]);
    const monthlyChange = ((lastClose - firstClose) / firstClose) * 100;

    return monthlyChange;
  } catch (error) {
    console.error(`Error fetching monthly change for ${symbol}:`, error.message);
    return 0;
  }
}




// Helper to fetch historical data from Binance
const fetchHistoricalData = async (symbol, interval = "1m", limit = 20) => {
  const response = await axios.get(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  return response.data.map((entry) => ({
    time: new Date(entry[0]).toISOString(), // Proper ISO format
    price: parseFloat(entry[4]),
  }));
};
let historicalDataCache = {};
// Endpoint to get graph data

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

app.get('/graph-data/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const timeframe = req.query.timeframe || '1m';
  const from = req.query.from ? new Date(Number(req.query.from) * 1000) : null;

  const validIntervals = ['1m', '15m', '1h', '1d', '1w', '1M'];
  const interval = validIntervals.includes(timeframe) ? timeframe : '1m';

  try {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
      params: {
        symbol: `${symbol.toUpperCase()}USDT`,
        interval,
        limit: 1000, // daha fazla veri alınca filtreleme daha etkili olur
      },
    });

    let formatted = response.data.map((row) => ({
      time: new Date(row[0]).toISOString(),
      timestamp: row[0],
      price: parseFloat(row[4]), // Close price
    }));

    if (from) {
      formatted = formatted.filter((point) => new Date(point.timestamp) >= from);
    }

    formatted = formatted.map(({ time, price }) => ({ time, price }));

    res.json(formatted);
  } catch (error) {
    console.error("Binance API error:", error.message);
    res.status(500).json({ message: "Failed to fetch chart data from Binance API" });
  }
});


app.get('/graph-candles/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const timeframe = req.query.timeframe || '1m';
  const from = req.query.from ? new Date(Number(req.query.from) * 1000) : null;

  const validIntervals = ['1m', '15m', '1h', '1d', '1w', '1M'];
  const interval = validIntervals.includes(timeframe) ? timeframe : '1m';

  try {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
      params: {
        symbol: `${symbol.toUpperCase()}USDT`,
        interval,
        limit: 1000,
      },
    });

    let formatted = response.data.map((row) => ({
      x: new Date(row[0]).toISOString(), // time
      timestamp: row[0],
      o: parseFloat(row[1]),
      h: parseFloat(row[2]),
      l: parseFloat(row[3]),
      c: parseFloat(row[4]),
    }));

    if (from) {
      formatted = formatted.filter((c) => new Date(c.timestamp) >= from);
    }

    formatted = formatted.map(({ x, o, h, l, c }) => ({ x, o, h, l, c }));

    res.json(formatted);
  } catch (error) {
    console.error("Error fetching candlestick data:", error.message);
    res.status(500).json({ message: "Failed to fetch candlestick data from Binance API" });
  }
});



// Periodic refresh of historical data
setInterval(async () => {
  const symbols = ['BTCUSDT', 'ETHUSDT']; // add more symbols if needed
  for (const symbol of symbols) {
    historicalDataCache[symbol] = await fetchHistoricalData(symbol);
  }
  console.log('Historical data refreshed.');
}, 6000000); // every 6000 seconds



// -------------------- Portfolio --------------------




  app.post('/create-portfolio', async (req, res) => {
    console.log(`islem eklendi`);
    const { userId, name, avatar } = req.body;
  
    if (!userId || !name) {
      return res.status(400).json({ message: 'userId and name are required' });
    }
  
    try {
      const portfolio = new Portfolio({
        userId,
        name,
        avatar,
        transactions: [],
      });
  
      await portfolio.save();
      res.status(201).json({ message: 'Portfolio created successfully', portfolio });
    } catch (error) {
      res.status(500).json({ message: 'Error creating portfolio', error: error.message });
    }
  });

  app.post('/portfolio/:id/transaction', async (req, res) => {
  const { id } = req.params; // Portfolio ID
  const { symbol, action, quantity, price, transactionDate } = req.body;

  if (!symbol || !action || !quantity || !price || !transactionDate) {
    return res.status(400).json({
      message: 'All fields are required: symbol, action, quantity, price, transactionDate',
    });
  }

  try {
    const total = quantity * price;
    if (quantity <= 0 || price <= 0) {
      return res.status(400).json({ message: 'Quantity and price must be positive numbers' });
    }

    if (!['buy', 'sell'].includes(action)) {
      return res.status(400).json({ message: 'Action must be either "buy" or "sell"' });
    }

    const portfolio = await Portfolio.findById(id);
    if (!portfolio) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    // 👇 Check if enough balance exists for sell
    if (action === 'sell') {
      const totalOwned = portfolio.transactions
        .filter(tx => tx.symbol === symbol)
        .reduce((acc, tx) => {
          return acc + (tx.action === 'buy' ? tx.quantity : -tx.quantity);
        }, 0);

      if (totalOwned < quantity) {
        return res.status(400).json({ message: `Not enough ${symbol} to sell.` });
      }
    }

    const newTransaction = {
      symbol,
      action,
      quantity,
      price,
      total,
      date: new Date(transactionDate),
    };

    portfolio.transactions.push(newTransaction);
    await portfolio.save();

    res.status(201).json({ message: 'Transaction added successfully', portfolio });
  } catch (error) {
    res.status(500).json({ message: 'Error adding transaction', error: error.message });
  }
});

app.put('/portfolio/:id', async (req, res) => {
  const { id } = req.params;
  const { name, avatar } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Name is required' });
  }

  try {
    const updated = await Portfolio.findByIdAndUpdate(
      id,
      { name, avatar },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    res.status(200).json({ message: 'Portfolio updated successfully', portfolio: updated });
  } catch (error) {
    res.status(500).json({ message: 'Error updating portfolio', error: error.message });
  }
});

  app.put('/portfolio/:portfolioId/transaction/:transactionId', async (req, res) => {
    const { portfolioId, transactionId } = req.params;
    const { symbol, action, quantity, price } = req.body;
  
    if (!symbol || !action || !quantity || !price) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
  
    try {
      const portfolio = await Portfolio.findById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ message: 'Portfolio not found.' });
      }
  
      const transaction = portfolio.transactions.id(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: 'Transaction not found.' });
      }
  
      transaction.symbol = symbol;
      transaction.action = action;
      transaction.quantity = quantity;
      transaction.price = price;
      transaction.total = quantity * price;
  
      await portfolio.save();
      res.status(200).json({ message: 'Transaction updated successfully.', transactions: portfolio.transactions });
    } catch (error) {
      res.status(500).json({ message: 'Error updating transaction', error: error.message });
    }
  });

  app.delete('/portfolio/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      const portfolio = await Portfolio.findByIdAndDelete(id);
      if (!portfolio) {
        return res.status(404).json({ message: 'Portfolio not found.' });
      }
      res.status(200).json({ message: 'Portfolio deleted successfully.' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting portfolio', error: error.message });
    }
  });

  app.get('/portfolios', async (req, res) => {
    console.log("portfolios")
    const { userId } = req.query;

  
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required.' });
    }
  
    try {
      const portfolios = await Portfolio.find({ userId });
      res.status(200).json(portfolios);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching portfolios', error: error.message });
    }
  });

  app.post('/portfolio/:id/transaction', async (req, res) => {
    const { id } = req.params;
    const { symbol, action, quantity, price } = req.body;
  
    if (!symbol || !action || !quantity || !price) {
      return res.status(400).json({ message: 'All fields are required: symbol, action, quantity, price' });
    }
  
    try {
      const total = quantity * price;
      if (quantity <= 0 || price <= 0) {
        return res.status(400).json({ message: 'Quantity and price must be positive numbers' });
      }
  
      if (!['buy', 'sell'].includes(action)) {
        return res.status(400).json({ message: 'Action must be either "buy" or "sell"' });
      }
  
      const portfolio = await Portfolio.findById(id);
      if (!portfolio) {
        return res.status(404).json({ message: 'Portfolio not found' });
      }
  
      const newTransaction = {
        symbol,
        action,
        quantity,
        price,
        total,
        date: new Date(), // Add timestamp
      };
  
      portfolio.transactions.push(newTransaction);
      await portfolio.save();
  
      res.status(201).json({ message: 'Transaction added successfully', portfolio });
    } catch (error) {
      res.status(500).json({ message: 'Error adding transaction', error: error.message });
    }
  });
  

  const authenticateToken = (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
  
    if (!token) {
      return res.status(401).json({ message: 'Access Denied: No Token Provided' });
    }
  
    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
      req.user = verified; // Attach user data to the request object
      next();
    } catch (error) {
      res.status(403).json({ message: 'Invalid Token' });
    }
  };
  
  app.get('/portfolios', authenticateToken, async (req, res) => {
  const userId = req.user.id; // Use authenticated user ID

  try {
    const portfolios = await Portfolio.find({ userId }); // Fetch portfolios for the authenticated user
    res.status(200).json(portfolios);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching portfolios', error: error.message });
  }
});

// Fetch a single portfolio by ID
app.get('/portfolio/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const portfolio = await Portfolio.findById(id);
    if (!portfolio) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }
    res.status(200).json(portfolio);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching portfolio', error: error.message });
  }
});



app.delete('/portfolio/:portfolioId/transaction/:transactionId', async (req, res) => {
  const { portfolioId, transactionId } = req.params;

  // Check if IDs are valid MongoDB Object IDs
  if (!mongoose.Types.ObjectId.isValid(portfolioId) || !mongoose.Types.ObjectId.isValid(transactionId)) {
    return res.status(400).json({ message: 'Invalid Portfolio ID or Transaction ID.' });
  }
  console.log("deleting");
  try {
    const portfolio = await Portfolio.findById(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ message: 'Portfolio not found.' });
    }

    const transaction = portfolio.transactions.id(transactionId);
    if (!transaction) {
      console.log('Transaction not found:', transactionId);
      return res.status(404).json({ message: 'Transaction not found.' });
    }
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    portfolio.transactions = portfolio.transactions.filter(t => t._id.toString() !== transactionId); // Remove the transaction
    await portfolio.save(); // Save the updated portfolio

    res.status(200).json({ transactions: portfolio.transactions });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting transaction', error: error.message });
  }
});


// -------------------- SETTINGS --------------------

// Yeni Settings yaratma
app.post('/settings', async (req, res) => {
  try {
    const { userId, theme, selectedCoins } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'userId is required.' });
    }

    const existingSettings = await Settings.findOne({ userId });
    if (existingSettings) {
      return res.status(400).json({ message: 'Settings already exist for this user.' });
    }

    const newSettings = new Settings({
      userId,
      theme: theme || 'light',
      selectedCoins: selectedCoins || [],
    });

    await newSettings.save();
    res.status(201).json({ message: 'Settings created successfully', settings: newSettings });
  } catch (error) {
    res.status(500).json({ message: 'Error creating settings', error: error.message });
  }
});

// Kullanıcı ayarlarını getir
app.get('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const settings = await Settings.findOne({ userId });
    if (!settings) {
      return res.status(404).json({ message: 'Settings not found for this user.' });
    }

    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
});

// Kullanıcı ayarlarını güncelle
app.put('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { theme, selectedCoins, priceAlerts } = req.body;

    const updatedSettings = await Settings.findOne({ userId });
    if (!updatedSettings) return res.status(404).json({ message: 'Settings not found' });

    updatedSettings.theme = theme || updatedSettings.theme;
    updatedSettings.selectedCoins = selectedCoins || updatedSettings.selectedCoins;

    if (priceAlerts) {
      updatedSettings.priceAlerts = priceAlerts;

      // Bildirim tetiklenmişse ama eşik değiştiyse notifiedCoin sıfırla
      for (const [coin, thresholds] of Object.entries(priceAlerts)) {
        const wasNotified = updatedSettings.notifiedCoins?.get(coin);
        if (wasNotified && (thresholds.min !== 0 || thresholds.max !== Infinity)) {
          updatedSettings.notifiedCoins.set(coin, false);
        }
      }
    }

    updatedSettings.markModified('priceAlerts');
    updatedSettings.markModified('notifiedCoins');
    await updatedSettings.save();

    res.status(200).json({ message: 'Settings updated successfully', settings: updatedSettings });
  } catch (error) {
    res.status(500).json({ message: 'Error updating settings', error: error.message });
  }
});




// -------------------- NEWS --------------------

// -------------------- CACHE FOR CRYPTO NEWS --------------------
let cachedNews = {
  en: null,
  tr: null,
  lastUpdated: null,
};

// -------------------- FUNCTION TO FETCH NEWS FROM GEMINI --------------------
// Define the Gemini API base URL with the API key
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyBGPf3bbR4GjlBvCvsovewnA-0bnJh8LRo`;

const fetchCryptoNews = async (language = "en", forceRefresh = false) => {
  try {
    const now = new Date();

    // Refresh cache if older than 24 hours OR forceRefresh is triggered
    const shouldRefresh = !cachedNews.lastUpdated || (now - cachedNews.lastUpdated) >= 24 * 60 * 60 * 1000 || forceRefresh;

    if (!shouldRefresh) {
      console.log(`Using cached crypto news (${language})`);
      return cachedNews[language];
    }

    console.log(`Fetching new crypto news in ${language}...`);

    const prompts = {
      en: "can you give me 15 detailed daily and this weeks detailed news about cryptocurrency. i will directly fech this data to my school project. no graphs or images. know it will be on the right sidebar. make the structure of text looks good. ",
      tr: "Bugünün kripto para piyasası trendlerinin kısa bir özetini sağlayın. Büyük fiyat hareketleri, en çok kazananlar ve önemli haber başlıklarını ekleyin.",
    };

    const requestBody = {
      contents: [{ parts: [{ text: prompts[language] }] }],
    };

    // Use the correct URL
    const response = await axios.post(GEMINI_API_URL, requestBody, {
      headers: { "Content-Type": "application/json" },
    });

    const newsSummary = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No news available.";

    // Update cache
    cachedNews[language] = newsSummary;
    cachedNews.lastUpdated = new Date();

    return newsSummary;
  } catch (error) {
    console.error("Error fetching crypto news:", error.message);
    return language === "tr"
      ? "Şu anda haberler getirilemiyor."
      : "Unable to fetch news at the moment.";
  }
};

// -------------------- API ENDPOINT: FETCH NEWS WITH CACHE --------------------
app.get("/crypto-news", async (req, res) => {
  try {
    const language = req.query.lang || "en";
    const forceRefresh = req.query.refresh === "true"; // Allow manual refresh

    if (!["en", "tr"].includes(language)) {
      return res.status(400).json({ message: "Invalid language. Use 'en' or 'tr'." });
    }

    const news = await fetchCryptoPanicNews(language, forceRefresh);

    res.json({
      language,
      news,
      lastUpdated: cachedCryptoPanicNews.lastUpdated,
    });
  } catch (error) {
    console.error("Error fetching crypto news:", error.message);
    res.status(500).json({ message: "Failed to fetch crypto news" });
  }
});

// -------------------- AUTOMATIC CACHE REFRESH (EVERY 24 HOURS) --------------------
const refreshCryptoNewsDaily = async () => {
  console.log("Refreshing daily crypto news...");
  await fetchCryptoNews("en", true);
  await fetchCryptoNews("tr", true);
  console.log("Crypto news updated.");
};

// Schedule news refresh every 24 hours
setInterval(refreshCryptoNewsDaily, 24 * 60 * 60 * 1000);

// Initial fetch on server startup
refreshCryptoNewsDaily();


let cachedCryptoPanicNews = {
  en: null,
  tr: null,
  lastUpdated: null,
};



const fetchCryptoPanicNews = async (language = "en", forceRefresh = false) => {
  try {
    const now = new Date();

    const shouldRefresh =
      !cachedCryptoPanicNews.lastUpdated ||
      now - cachedCryptoPanicNews.lastUpdated >= 24 * 60 * 60 * 1000 ||
      forceRefresh;

    if (!shouldRefresh) {
      console.log(`Using cached CryptoPanic news`);
      return cachedCryptoPanicNews["en"];
    }

    console.log(`Fetching new CryptoPanic news in ENGLISH...`);

    const params = {
      auth_token: process.env.CRYPTOPANIC_TOKEN,
      regions: "en",
      kind: "news",
      public: true,
    };

    const response = await axios.get("https://cryptopanic.com/api/v1/posts/", { params });

    const isProbablyEnglish = (text) => /^[\x00-\x7F]*$/.test(text); // ASCII only

    const filtered = response.data.results.filter(
      (item) => isProbablyEnglish(item.title)
    );

    if (filtered.length > 0) {
      cachedCryptoPanicNews["en"] = filtered;
      cachedCryptoPanicNews.lastUpdated = new Date();
      return filtered;
    }

    console.log("No English news found.");
    return [];
  } catch (error) {
    console.error("Error fetching CryptoPanic news:", error.message);
    return [];
  }
};







// -------------------- COIN GECKPO--------------------

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

// Fetch global market data
const fetchGlobalMarketData = async () => {
  try {
    const response = await axios.get(`${COINGECKO_BASE_URL}/global`);
    return response.data.data;
  } catch (error) {
    console.error("Error fetching global market data:", error.message);
    return null;
  }
};

// Fetch trending coins
const fetchTrendingCoinss = async () => {
  try {
    const response = await axios.get(`${COINGECKO_BASE_URL}/search/trending`);
    return response.data.coins.map((coin) => ({
      name: coin.item.name,
      symbol: coin.item.symbol,
      market_cap_rank: coin.item.market_cap_rank,
    }));
  } catch (error) {
    console.error("Error fetching trending coins:", error.message);
    return [];
  }
};

// Fetch top cryptocurrencies by market cap
const fetchTopCoins = async () => {
  try {
    const response = await axios.get(`${COINGECKO_BASE_URL}/coins/markets`, {
      params: {
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: 3, // Fetch only the top 3 coins
        page: 1,
      },
    });
    return response.data.map((coin) => ({
      name: coin.name,
      symbol: coin.symbol,
      price: coin.current_price,
      market_cap: coin.market_cap,
      volume: coin.total_volume,
      change_24h: coin.price_change_percentage_24h,
    }));
  } catch (error) {
    console.error("Error fetching top coins:", error.message);
    return [];
  }
};

const GEMINI_API_KEY = "AIzaSyBGPf3bbR4GjlBvCvsovewnA-0bnJh8LRo";

const generateNewsFromGemini = async (globalData, topCoins, language = "en") => {
  try {
    if (!globalData || !topCoins) {
      throw new Error("Missing required data: globalData or topCoins");
    }

    const prompts = {
      en: ` give the longest answer you can. keep it long. give it like header and explanation for each topic, make it more readable. use \n for new line.
        Today's cryptocurrency market update:
        - Total Market Cap: $${(globalData.total_market_cap?.usd / 1e12 || 0).toFixed(2)} Trillion
        - 24h Trading Volume: $${(globalData.total_volume?.usd / 1e9 || 0).toFixed(2)} Billion
        - Bitcoin Dominance: ${(globalData.market_cap_percentage?.btc || 0).toFixed(2)}%
        - Ethereum Dominance: ${(globalData.market_cap_percentage?.eth || 0).toFixed(2)}%

        Key Price Movements (Top 3 Coins by Market Cap):
        ${
          topCoins.slice(0, 3).length > 0
            ? topCoins
                .slice(0, 3)
                .map((coin) => `- ${coin.name || "Unknown"}: $${coin.price?.toLocaleString() || "N/A"} (${coin.change_24h?.toFixed(2) || 0}% change)`)
                .join("\n")
            : "No top coins available."
        }

        Summarize this information into a brief market update.
      `,
      tr: `
        Bugünün kripto para piyasası güncellemesi:
        - Toplam Piyasa Değeri: $${(globalData.total_market_cap?.usd / 1e12 || 0).toFixed(2)} Trilyon
        - 24 Saatlik Ticaret Hacmi: $${(globalData.total_volume?.usd / 1e9 || 0).toFixed(2)} Milyar
        - Bitcoin Hakimiyeti: ${(globalData.market_cap_percentage?.btc || 0).toFixed(2)}%
        - Ethereum Hakimiyeti: ${(globalData.market_cap_percentage?.eth || 0).toFixed(2)}%

        Piyasa Değeri En Yüksek 3 Coin'in Ana Fiyat Hareketleri:
        ${
          topCoins.slice(0, 3).length > 0
            ? topCoins
                .slice(0, 3)
                .map((coin) => `- ${coin.name || "Unknown"}: $${coin.price?.toLocaleString() || "N/A"} (${coin.change_24h?.toFixed(2) || 0}% değişim)`)
                .join("\n")
            : "En iyi coin bilgisi mevcut değil."
        }

        Bu bilgileri özetleyerek kısa bir piyasa güncellemesi sağlayın.
      `,
    };

    const requestBody = {
      contents: [{ parts: [{ text: prompts[language] }] }],
    };

    const response = await axios.post(GEMINI_API_URL, requestBody
    );

    const summary = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No news available.";
    return summary;
  } catch (error) {
    console.error("Error generating news with Gemini:", error.message);
    return language === "tr"
      ? "Şu anda piyasa özeti getirilemiyor."
      : "Unable to generate market summary at the moment.";
  }
};

// New endpoint to test in Postman
let cachedNewsgemini = null; // Cache for Gemini news
let cacheTimestamp = null; // Timestamp for the cached news

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

app.get("/geminicrypto-news", async (req, res) => {
  try {
    const language = req.query.lang || "en";

    // Check if cached news is still valid
    if (cachedNewsgemini && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_DURATION) {
      return res.json({ news: cachedNewsgemini, lastUpdated: cacheTimestamp });
    }

    // Fetch required data
    const globalData = await fetchGlobalMarketData();
    const topCoins = await fetchTopCoins();

    // Validate the fetched data
    if (!globalData) {
      return res.status(500).json({ message: "Global data is missing." });
    }

    if (!Array.isArray(topCoins) || topCoins.length === 0) {
      return res.status(500).json({ message: "Top coins are missing or empty." });
    }

    // Generate the market update
    const news = await generateNewsFromGemini(globalData, topCoins, language);

    // Cache the generated news and timestamp
    cachedNewsgemini = news;
    cacheTimestamp = Date.now();

    res.json({ news, lastUpdated: cacheTimestamp });
  } catch (error) {
    console.error("Error in /geminicrypto-news endpoint:", error.message);
    res.status(500).json({ message: "Unable to generate crypto news at the moment." });
  }
});

module.exports = generateNewsFromGemini;

// -------------------- FIBONACCHI GRAPH --------------------





const graphcache = new Map(); // In-memory cache

// Middleware to clean up expired cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, { expiry }] of graphcache.entries()) {
    if (expiry <= now) {
      graphcache.delete(key);
    }
  }
}, CACHE_DURATION);

app.get("/api/fibonacci/:symbol/:timeframe", async (req, res) => {
  const { symbol, timeframe } = req.params;
  const cacheKey = `${symbol}-${timeframe}`;

  // Check if the data is in the cache
  if (graphcache.has(cacheKey)) {
    console.log("Cache hit for:", cacheKey);
    return res.json(graphcache.get(cacheKey).data);
  }

  try {
    // Step 1: Fetch the list of coins from CoinGecko
    const coinListResponse = await axios.get(`${COINGECKO_BASE_URL}/coins/list`);
    const coinList = coinListResponse.data;

    // Step 2: Map the symbol to CoinGecko ID
    const coin = coinList.find(
      (c) => c.symbol.toLowerCase() === symbol.toLowerCase() && c.id !== "batcat"
    );

    if (!coin) {
      return res.status(404).json({ error: `Coin not found for symbol: ${symbol}` });
    }

    // Step 3: Fetch market chart data for the matched coin ID
    const marketChartResponse = await axios.get(
      `${COINGECKO_BASE_URL}/coins/${coin.id}/market_chart?x_cg_demo_api_key=CG-nQk3dYBGHBQAnS5mkq2V5c3v	`,
      {
        params: {
          vs_currency: "usd",
          days: timeframe,
          interval: "daily",
        },
      }
    );

    const marketChart = marketChartResponse.data;

    // Step 4: Combine data and cache it
    const responseData = {
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      marketChart,
    };

    // Store the response in the cache
    graphcache.set(cacheKey, {
      data: responseData,
      expiry: Date.now() + CACHE_DURATION,
    });

    console.log("Cache miss, data fetched and cached for:", cacheKey);

    // Respond with the combined data
    res.json(responseData);
  } catch (error) {
    console.error("Error in Fibonacci API:", error.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = app;


// ────── PREDICT ENDPOINT ──────

const ort = require('onnxruntime-node');
// ────── INTERVAL PARSING ──────
const INTERVAL_MAP = {
  '15m':  15,
  '1h':   60,
  '4h':   240,
  '1d':   1440
};

function parseInterval(str) {
  const mins = INTERVAL_MAP[str];
  if (!mins) {
    throw new Error(`Invalid interval "${str}". Use one of ${Object.keys(INTERVAL_MAP).join(', ')}`);
  }
  return mins;
}
async function getLaggedPrice(symbol, minutes) {
  const limit = minutes + 1;
  const resp = await axios.get(
    'https://api.binance.com/api/v3/klines',
    { params: { symbol: `${symbol}USDT`, interval: '1m', limit } }
  );
  return parseFloat(resp.data[0][4]);
}
// ────── LOAD SCALER + MODEL ──────
const scalerLr = JSON.parse(
  fs.readFileSync('./models/scaler_lr.json', 'utf8')
);

let lrSession = null;
ort.InferenceSession.create('./models/linear_regression.onnx')
  .then(s => {
    lrSession = s;
    console.log('✅ Linear Regression ONNX loaded');
  })
  .catch(err => console.error('❌ LR load error:', err));
// scale utility for LR
function scaleWithLr(rawArr) {
  return rawArr.map((v,i) =>
    (v - scalerLr.mean[i]) / scalerLr.std[i]
  );
}

const scalerTree = JSON.parse(
  fs.readFileSync('./models/scaler_tree.json', 'utf8')
);

let treeSession = null;
ort.InferenceSession.create('./models/tree_regressor.onnx')
  .then(s => {
    treeSession = s;
    console.log('✅ Decision Tree ONNX loaded');
  })
  .catch(err => console.error('❌ Tree load error:', err));

// reuse your existing getLaggedPrice()

function scaleWithTree(rawArr) {
  return rawArr.map((v,i) =>
    (v - scalerTree.mean[i]) / scalerTree.std[i]
  );
}

// ────── DYNAMIC TREE PREDICTION ENDPOINT ──────
// now at: GET /predict/tree/:symbol/:interval

app.get('/predict/tree/:symbol/:interval', async (req, res) => {
  if (!treeSession) {
    return res.status(503).json({ error: 'Tree model not ready' });
  }

  const sym      = req.params.symbol.toUpperCase();
  let   interval;
  try {
    interval = parseInterval(req.params.interval);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    // 1) build last-5 intervals: [interval, 2×interval, …, 5×interval]
    const lags = [1,2,3,4,5].map(i => i * interval);

    // 2) fetch closes at those lags
    const closes = await Promise.all(lags.map(m => getLaggedPrice(sym, m)));

    // 3) features = raw closes (or returns if your Tree was trained on returns)
    const raw = closes;

    // 4) scale & create tensor
    const scaled = scaleWithTree(raw);
    const tensor = new ort.Tensor(
      'float32',
      Float32Array.from(scaled),
      [1, scaled.length]
    );

    // 5) run inference
    const outMap     = await treeSession.run({ input: tensor });
    const outName    = Object.keys(outMap)[0];
    const prediction = outMap[outName].data[0];

    // 6) respond
    res.json({
      model:       'decision_tree',
      symbol:      sym,
      interval:    req.params.interval,
      lagsMinutes: lags,
      raw,
      prediction   // next-interval close
    });
  } catch (err) {
    console.error('Tree predict error:', err);
    res.status(500).json({ error: 'Tree prediction failed' });
  }
});

// ────── LOAD SVR SCALER & MODEL ──────
const scalerSvr = JSON.parse(
  fs.readFileSync('./models/scaler_svr.json', 'utf8')
);

let svrSession = null;
ort.InferenceSession.create('./models/svr.onnx')
  .then(s => {
    svrSession = s;
    console.log('✅ SVR ONNX loaded');
  })
  .catch(err => console.error('❌ SVR load error:', err));

// reuse your existing getLaggedPrice()

function scaleWithSvr(rawArr) {
  return rawArr.map((v,i) =>
    (v - scalerSvr.mean[i]) / scalerSvr.std[i]
  );
}

// ────── DYNAMIC SVR PREDICTION ENDPOINT ──────
// now at: GET /predict/svr/:symbol/:interval

// reuse INTERVAL_MAP and parseInterval from above…

app.get('/predict/svr/:symbol/:interval', async (req, res) => {
  if (!svrSession) {
    return res.status(503).json({ error: 'SVR model not ready' });
  }

  const sym      = req.params.symbol.toUpperCase();
  let   interval;
  try {
    interval = parseInterval(req.params.interval);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    // 1) last-5 intervals: [interval,2×interval,…,5×interval]
    const lags = [1,2,3,4,5].map(i => i * interval);

    // 2) fetch closes at those lags
    const closes = await Promise.all(lags.map(m => getLaggedPrice(sym, m)));

    // 3) features = raw closes (or compute returns if your SVR used returns)
    const raw = closes;

    // 4) scale & tensor
    const scaled = scaleWithSvr(raw);
    const tensor = new ort.Tensor(
      'float32',
      Float32Array.from(scaled),
      [1, scaled.length]
    );

    // 5) inference
    const outMap     = await svrSession.run({ input: tensor });
    const outName    = Object.keys(outMap)[0];
    const prediction = outMap[outName].data[0];

    // 6) respond
    res.json({
      model:       'svr',
      symbol:      sym,
      interval:    req.params.interval,
      lagsMinutes: lags,
      raw,
      prediction   // next-interval close
    });
  } catch (err) {
    console.error('SVR predict error:', err);
    res.status(500).json({ error: 'SVR prediction failed' });
  }
});

// ────── LOAD SCALER & RF MODEL ──────
const scalerRf = JSON.parse(
  fs.readFileSync('./models/scaler_rf.json', 'utf8')
);

let rfSession = null;
ort.InferenceSession.create('./models/rf_regressor.onnx')
  .then(s => {
    rfSession = s;
    console.log('✅ Random Forest ONNX loaded');
  })
  .catch(err => console.error('❌ RF load error:', err));

// reuse getLaggedPrice from above…

function scaleWithRf(rawArr) {
  return rawArr.map((v,i) =>
    (v - scalerRf.mean[i]) / scalerRf.std[i]
  );
}

// ────── DYNAMIC RF PREDICTION ENDPOINT ──────
// now at: GET /predict/rf/:symbol/:interval
app.get('/predict/rf/:symbol/:interval', async (req, res) => {
  if (!rfSession) {
    return res.status(503).json({ error: 'RF model not ready' });
  }

  const sym      = req.params.symbol.toUpperCase();
  let   interval;
  try {
    interval = parseInterval(req.params.interval);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
     // 1) fetch current price
    const nowResp = await axios.get(
      'https://api.binance.com/api/v3/ticker/price',
      { params: { symbol: `${sym}USDT` } }
    );
    const now = parseFloat(nowResp.data.price);

    // 2) build last-5 intervals: [interval, 2×interval, …, 5×interval]
    const lags = [1,2,3,4,5].map(i => i * interval);

    // 3) fetch closes at those lags
    const closes = await Promise.all(lags.map(m => getLaggedPrice(sym, m)));

    // 4) use raw closes as features
    const raw = closes;

    // 5) scale & create tensor
    const scaled = scaleWithRf(raw);
    const tensor = new ort.Tensor(
      'float32',
      Float32Array.from(scaled),
      [1, scaled.length]
    );

    // 6) run inference
    const outMap     = await rfSession.run({ input: tensor });
    const outName    = Object.keys(outMap)[0];
    const prediction = outMap[outName].data[0];

    // 7) respond
    res.json({
      model:       'random_forest',
      symbol:      sym,
      interval:    req.params.interval,
      lagsMinutes: lags,
      raw,
      prediction   // predicted next-interval close
    });
  } catch (err) {
    console.error('RF predict error:', err);
    res.status(500).json({ error: 'RF prediction failed' });
  }
});




// ────── DYNAMIC LR PREDICTION ENDPOINT ──────
// now at: GET /predict/lr/:symbol/:interval
app.get('/predict/lr/:symbol/:interval', async (req, res) => {
  if (!lrSession) {
    return res.status(503).json({ error: 'LR model not ready' });
  }

  const sym      = req.params.symbol.toUpperCase();
  let   interval;
  try {
    interval = parseInterval(req.params.interval);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    // 1) fetch current price
    const nowResp = await axios.get(
      'https://api.binance.com/api/v3/ticker/price',
      { params: { symbol: `${sym}USDT` } }
    );
    const now = parseFloat(nowResp.data.price);

    // 2) build last-5 intervals: [interval, 2×interval, …, 5×interval]
    const lags = [1,2,3,4,5].map(i => i * interval);

    // 3) fetch lagged closes
    const lagValues = await Promise.all(lags.map(m => getLaggedPrice(sym, m)));

    // 4) (optional) build returns if your LR was trained on returns:
    // const raw = lagValues.map(p => (now - p) / p);
    // here we assume raw = lagged closes
    const raw = lagValues;

    // 5) scale & tensor
    const scaled = scaleWithLr(raw);
    const tensor = new ort.Tensor(
      'float32',
      Float32Array.from(scaled),
      [1, scaled.length]
    );

    // 6) inference
    const outMap = await lrSession.run({ input: tensor });
    const key    = Object.keys(outMap)[0];
    const prediction = outMap[key].data[0];

    // 7) respond
    res.json({
      model:      'linear_regression',
      symbol:     sym,
      interval:   req.params.interval,
      lagsMinutes:lags,
      raw,
      prediction  // next-interval close
    });
  } catch (err) {
    console.error('LR predict error:', err);
    res.status(500).json({ error: 'LR prediction failed' });
  }
});

// ────── LOAD LSTM SCALER & MODEL ──────
const scalerLstm = JSON.parse(
  fs.readFileSync('./models/scaler_lstm.json', 'utf8')
);

let lstmSession = null;
ort.InferenceSession.create('./models/lstm.onnx')
  .then(s => {
    lstmSession = s;
    console.log('✅ LSTM ONNX loaded');
  })
  .catch(err => console.error('❌ LSTM load error:', err));

// reuse your getLaggedPrice(symbol, minutes) helper

function scaleWithLstm(rawArr) {
  return rawArr.map((v,i) =>
    (v - scalerLstm.mean[i]) / scalerLstm.std[i]
  );
}

// ────── DYNAMIC LSTM PREDICTION ENDPOINT ──────
// now accepts: /predict/lstm/:symbol/:interval
app.get('/predict/lstm/:symbol/:interval', async (req, res) => {
  if (!lstmSession) {
    return res.status(503).json({ error: 'LSTM model not ready' });
  }

  const sym      = req.params.symbol.toUpperCase();
  let   interval;
  try {
    interval = parseInterval(req.params.interval);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    // 1) fetch current price
    const nowResp = await axios.get(
      'https://api.binance.com/api/v3/ticker/price',
      { params: { symbol: `${sym}USDT` } }
    );
    const now = parseFloat(nowResp.data.price);

    // 2) build last-5 intervals: [interval,2×interval,…,5×interval]
    const lags = [1,2,3,4,5].map(i => i * interval);

    // 3) fetch closes at those lags
    const closes = await Promise.all(lags.map(m => getLaggedPrice(sym, m)));

    // 4) (optional) compute returns instead of raw closes:
    // const raw = closes.map(p => (now - p) / p);
    // here we use raw = closes
    const raw = closes;

    // 5) scale & reshape to [1, seq_len, 1]
    const scaled = scaleWithLstm(raw);
    const tensor = new ort.Tensor(
      'float32',
      Float32Array.from(scaled),
      [1, scaled.length, 1]
    );

    // 6) run inference
    const outMap     = await lstmSession.run({ input: tensor });
    const prediction = outMap['output'].data[0];

    // 7) respond
    res.json({
      model:      'lstm',
      symbol:     sym,
      interval:   req.params.interval,
      lagsMinutes: lags,
      raw,
      prediction
    });

  } catch (err) {
    console.error('LSTM predict error:', err);
    res.status(500).json({ error: 'LSTM prediction failed' });
  }
});


// ────── LOAD SCALER & CNN REGRESSOR ──────
const scalerCnnReg = JSON.parse(
  fs.readFileSync('./models/scaler_cnn_reg.json', 'utf8')
);

let cnnRegSession = null;
ort.InferenceSession.create('./models/cnn_reg.onnx')
  .then(s => {
    cnnRegSession = s;
    console.log('✅ CNN regressor ONNX loaded');
  })
  .catch(err => console.error('❌ CNN reg load error:', err));

// reuse getLaggedPrice(symbol, minutes)…

function scaleWithCnnReg(rawArr) {
  return rawArr.map((v,i) =>
    (v - scalerCnnReg.mean[i]) / scalerCnnReg.std[i]
  );
}

// ────── CNN REGRESSOR ENDPOINT ──────
app.get('/predict/cnn_reg/:symbol/:interval', async (req, res) => {
  if (!cnnRegSession) {
    return res.status(503).json({ error: 'CNN regressor not ready' });
  }

  const sym      = req.params.symbol.toUpperCase();
  let   interval;
  try {
    interval = parseInterval(req.params.interval);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    // 1) fetch current price
    const nowResp = await axios.get(
      'https://api.binance.com/api/v3/ticker/price',
      { params: { symbol: `${sym}USDT` } }
    );
    const now = parseFloat(nowResp.data.price);

    // 2) build last-5 intervals: [interval, 2×interval, …, 5×interval]
    const lags = [1,2,3,4,5].map(i => i * interval);

    // 3) fetch closes at those lags
    const closes = await Promise.all(lags.map(m => getLaggedPrice(sym, m)));

    // 4) build raw features (raw closes; switch to returns if you prefer)
    const raw = closes;

    // 5) scale & create tensor
    const scaled = scaleWithCnnReg(raw);
    const tensor = new ort.Tensor(
      'float32',
      Float32Array.from(scaled),
      [1, scaled.length]
    );

    // 6) run inference
    const outMap = await cnnRegSession.run({ input: tensor });
    const pred   = outMap.output.data[0];

    // 7) respond
    res.json({
      model:      'cnn_regressor',
      symbol:     sym,
      interval:   req.params.interval,
      lags:       lags,
      raw,        // the five closes
      prediction: pred
    });

  } catch (err) {
    console.error('CNN reg predict error:', err);
    res.status(500).json({ error: 'CNN reg prediction failed' });
  }
});
// scripts/testPredict.js


async function test(symbol, interval) {
  try {
    // Hit the dynamic-CNN endpoint:
    const url = `http://localhost:5000/predict/lr/${symbol}/${interval}`;
    const { data } = await axios.get(url);
    console.log(
      `${symbol} [${interval}] → lags:`,
      data.lags || data.raw,
      `→ prediction:`,
      data.predictions || data.prediction
    );
  } catch (e) {
    console.error(
      `${symbol} [${interval}] failed:`,
      e.response?.status,
      e.message
    );
  }
}

const symbols   = ['BTC','ETH','XRP','DOGE'];
const intervals = ['15m','1h','4h','1d'];

for (const symbol of symbols) {
  for (const interval of intervals) {
    test(symbol, interval);
  }
}
// -------------------- START SERVER --------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
