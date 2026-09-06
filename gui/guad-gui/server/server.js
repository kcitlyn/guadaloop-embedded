const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
let db;
let sensorDataCollection;

const connectToMongoDB = async () => {
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    console.log('Connected to MongoDB successfully');
    
    db = client.db(process.env.DB_NAME || 'guad_pod');
    sensorDataCollection = db.collection('sensor_data');
    
    // Create indexes for better query performance
    await sensorDataCollection.createIndex({ timestamp: -1 });
    await sensorDataCollection.createIndex({ packetType: 1 });
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Routes
app.post('/api/sensor-data', async (req, res) => {
  try {
    const { packetType, podState, podHealth, sensorData, rawData } = req.body;
    
    const document = {
      timestamp: new Date(),
      packetType,
      podState,
      podHealth,
      sensorData,
      rawData
    };
    
    const result = await sensorDataCollection.insertOne(document);
    res.status(201).json({ 
      success: true, 
      id: result.insertedId 
    });
  } catch (error) {
    console.error('Error inserting data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get recent sensor data
app.get('/api/sensor-data', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const packetType = req.query.packetType;
    
    let query = {};
    if (packetType) {
      query.packetType = parseInt(packetType);
    }
    
    const data = await sensorDataCollection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get data by date range
app.get('/api/sensor-data/range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query = {
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };
    
    const data = await sensorDataCollection
      .find(query)
      .sort({ timestamp: -1 })
      .toArray();
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching data by range:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mongodb: db ? 'connected' : 'disconnected' 
  });
});

// Start server
const startServer = async () => {
  await connectToMongoDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
