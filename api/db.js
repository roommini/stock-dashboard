const mongoose = require('mongoose');

// Use environment variable for MongoDB, fallback to local for dev if needed
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://mock:mock@cluster0.mongodb.net/stock_dashboard?retryWrites=true&w=majority";

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    const opts = { bufferCommands: false };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectToDatabase;
