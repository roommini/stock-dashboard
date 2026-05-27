const connectToDatabase = require('./db');
const Event = require('./models/Event');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    try {
      await connectToDatabase();
      const { symbol } = req.query;
      
      let query = {};
      if (symbol) query.symbol = symbol.toUpperCase();
      
      const events = await Event.find(query).sort({ date: 1 });
      res.status(200).json(events);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
};
