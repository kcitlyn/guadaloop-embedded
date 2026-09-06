import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

class MongoDBService {
  // Save sensor data to MongoDB
  async saveSensorData(packetType, podState, podHealth, sensorData, rawData) {
    try {
      const response = await axios.post(`${API_URL}/sensor-data`, {
        packetType,
        podState,
        podHealth,
        sensorData,
        rawData
      });
      return response.data;
    } catch (error) {
      console.error('Error saving to MongoDB:', error);
      throw error;
    }
  }

  // Get recent sensor data
  async getRecentData(limit = 100, packetType = null) {
    try {
      let url = `${API_URL}/sensor-data?limit=${limit}`;
      if (packetType) {
        url += `&packetType=${packetType}`;
      }
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching from MongoDB:', error);
      throw error;
    }
  }

  // Get data by date range
  async getDataByRange(startDate, endDate) {
    try {
      const response = await axios.get(`${API_URL}/sensor-data/range`, {
        params: { startDate, endDate }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching data by range:', error);
      throw error;
    }
  }

  // Check backend health
  async checkHealth() {
    try {
      const response = await axios.get(`${API_URL}/health`);
      return response.data;
    } catch (error) {
      console.error('Backend health check failed:', error);
      return { status: 'error', mongodb: 'disconnected' };
    }
  }
}

export default new MongoDBService();
