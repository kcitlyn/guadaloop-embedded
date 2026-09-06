import React, { useState, useEffect, useReducer, useCallback, useRef } from 'react';
import SemiCircleProgressBar from "react-progressbar-semicircle";
import FileWriter from './components/FileWriter';
import mongoDBService from './services/mongoDBService';
import logo from './components/white_guad.png'; // Make sure the path is correct
import podImage from './components/pod_top.png';
import './App.css';

const stateDescriptions = [
  { name: "Initialization",
    commands: [
      { text: "Run Health Check", command: "2", targetState: "Ready" }
    ]},
  { name: "Health Check", commands: [] }, // No button for this state
  { name: "Ready",
    commands: [
      { text: "Levitation On", command: "3", targetState: "Levitation" }
    ]},
  { name: "Levitation",
    commands: [
      { text: "Levitation Off", command: "4", targetState: "Ready" },
      { text: "Propulsion On", command: "5", targetState: "Propulsion" }
    ]},
  { name: "Propulsion", commands: [] }, // No button for this state
  { name: "Coasting",
    commands: [
      { text: "Braking", command: "6", targetState: "Stopped" }
    ]},
  { name: "Braking", commands: [] }, // No button for this state
  { name: "Stopped", commands: [] } // No button for this state
];

const initialState = {
  tempSensors: {
    frontHub: {
      leftYokeFront: 0,
      leftYokeBack: 0,
      rightYokeFront: 0,
      rightYokeBack: 0
    },
    centerHub: {
      limLeft: 0,
      limRight: 0
    },
    rearHub: {
      leftYokeFront: 0,
      leftYokeBack: 0,
      rightYokeFront: 0,
      rightYokeBack: 0
    }
  },
  hallEffectSensors: {
    frontHub: {
      leftYokeFront: 0,
      leftYokeBack: 0,
      rightYokeFront: 0,
      rightYokeBack: 0,
      limCenter: 0
    },
    centerHub: {
      limLeft: 0,
      limRight: 0
    },
    rearHub: {
      leftYokeFront: 0,
      leftYokeBack: 0,
      rightYokeFront: 0,
      rightYokeBack: 0,
      limCenter: 0
    }
  },
  imuData: {
    rear: {
      accelerometer: { x: 0, y: 0, z: 0 },
      gyroscope: { x: 0, y: 0, z: 0 }
    },
    center: {
      accelerometer: { x: 0, y: 0, z: 0 },
      gyroscope: { x: 0, y: 0, z: 0 }
    },
    front: {
      accelerometer: { x: 0, y: 0, z: 0 },
      gyroscope: { x: 0, y: 0, z: 0 }
    }
  },
  podState: stateDescriptions[0].name,
  podHealth: true,
  gapHeightSensors: Array(8).fill(0.00),
  batteryVoltages: Array(144).fill(0.00)
};

const sensorReducer = (state, action) => {
  switch (action.type) {
    case 'UPDATE_POD_STATE':
      return { ...state, podState: action.payload };
    case 'UPDATE_POD_HEALTH':
      return { ...state, podHealth: action.payload };
      case 'UPDATE_IMU_DATA':
        const { position, sensorType, data } = action.payload;
        if (!state.imuData[position]) {
          console.warn(`No position found in IMU data for position: ${position}`);
          return state;
        }
        return {
          ...state,
          imuData: {
            ...state.imuData,
            [position]: {
              ...state.imuData[position],
              [sensorType]: {
                ...state.imuData[position][sensorType],
                ...data
              },
            },
          },
        };
      
    case 'UPDATE_HALL_EFFECT_SENSORS':
      return { ...state, hallEffectSensors: { ...state.hallEffectSensors, ...action.payload } };
    case 'UPDATE_TEMP_SENSORS':
      return { ...state, tempSensors: { ...state.tempSensors, ...action.payload } };
    case 'UPDATE_GAP_HEIGHT_SENSORS':
      return { ...state, gapHeightSensors: action.payload };
    case 'UPDATE_BATTERY_VOLTAGES':
      return { ...state, batteryVoltages: action.payload };
    default:
      return state;
  }
};

function App() {
  const [isSendingIdle, setIsSendingIdle] = useState(false); // Initially, do not send idle commands
  const [idleCommandAllowed, setIdleCommandAllowed] = useState(true); // Control idle commands based on state changes
  const [port, setPort] = useState();
  const [reader, setReader] = useState(null);
  const [displayedData, dispatch] = useReducer(sensorReducer, initialState);
  const [bufferedData, setBufferedData] = useState([]);
  const [podConnected, setPodConnected] = useState(false);
  const [commandToBeSent, setCommand] = useState("");
  const [fileWriterData, setFileWriterData] = useState("");
  const [consoleMessages, setConsoleMessages] = useState([]); // State to store console messages
  const consoleRef = useRef(null);
  const [spacePressCount, setSpacePressCount] = useState(0);
  const spaceTimeoutRef = useRef(null);
  const [currentCommand, setCurrentCommand] = useState({ commandText: '', commandCode: '', targetState: '' });
  const [keepSendingCommand, setKeepSendingCommand] = useState(false);
  const [mongoDBConnected, setMongoDBConnected] = useState(false); // MongoDB connection status
  const [saveToMongoDB, setSaveToMongoDB] = useState(true); // Toggle for saving to MongoDB


  const addToConsole = (msg) => {
    setConsoleMessages(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  useEffect(() => {
    if (consoleRef.current) {
        consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
}, [consoleMessages]);

  // Check MongoDB connection on component mount
  useEffect(() => {
    const checkMongoDBConnection = async () => {
      try {
        const health = await mongoDBService.checkHealth();
        if (health.status === 'ok' && health.mongodb === 'connected') {
          setMongoDBConnected(true);
          addToConsole('MongoDB connected successfully');
        } else {
          setMongoDBConnected(false);
          addToConsole('MongoDB connection failed');
        }
      } catch (error) {
        setMongoDBConnected(false);
        addToConsole('Backend server not reachable');
      }
    };
    checkMongoDBConnection();
  }, []);

  // Poll backend API for data when Web Serial is not connected
  useEffect(() => {
    if (podConnected) {
      // If Web Serial is connected, don't poll API
      return;
    }

    let lastProcessedId = null;

    const pollBackendData = async () => {
      try {
        const response = await mongoDBService.getRecentData(1); // Get 1 most recent packet
        if (response.success && response.data && response.data.length > 0) {
          const latestPacket = response.data[0];

          // Only process if it's a new packet
          if (latestPacket._id !== lastProcessedId) {
            lastProcessedId = latestPacket._id;
            // Process the raw data through the same parser
            if (latestPacket.rawData) {
              processSerialData(latestPacket.rawData);
            }
          }
        }
      } catch (error) {
        console.error('Error polling backend:', error);
      }
    };

    // Poll every 100ms for smooth updates
    const pollInterval = setInterval(pollBackendData, 100);

    // Initial poll
    pollBackendData();

    return () => clearInterval(pollInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podConnected]); // Re-run if connection status changes

  const dataProcessingInterval = 1000; // Interval for processing buffered data
  const [activeTab, setActiveTab] = useState('sensors'); // Default active tab
  const [sidebarVisible, setSidebarVisible] = useState(true); // State to toggle sidebar visibility
  
  // Calculate low, high, and average temperatures from new nested structure
  const getAllTemps = () => {
    const temps = [];
    // Front Hub
    temps.push(displayedData.tempSensors.frontHub.leftYokeFront);
    temps.push(displayedData.tempSensors.frontHub.leftYokeBack);
    temps.push(displayedData.tempSensors.frontHub.rightYokeFront);
    temps.push(displayedData.tempSensors.frontHub.rightYokeBack);
    // Center Hub
    temps.push(displayedData.tempSensors.centerHub.limLeft);
    temps.push(displayedData.tempSensors.centerHub.limRight);
    // Rear Hub
    temps.push(displayedData.tempSensors.rearHub.leftYokeFront);
    temps.push(displayedData.tempSensors.rearHub.leftYokeBack);
    temps.push(displayedData.tempSensors.rearHub.rightYokeFront);
    temps.push(displayedData.tempSensors.rearHub.rightYokeBack);
    return temps;
  };
  
  const allTemps = getAllTemps();
  const lowTemperature = Math.min(...allTemps);
  const highTemperature = Math.max(...allTemps);
  const averageTemperature = allTemps.reduce((acc, curr) => acc + curr, 0) / allTemps.length;
  

  // Ensure values are finite or set a default/fallback value
  const lowTemp = isFinite(lowTemperature) ? lowTemperature.toFixed(2) : 'N/A';
  const highTemp = isFinite(highTemperature) ? highTemperature.toFixed(2) : 'N/A';
  const avgTemp = isFinite(averageTemperature) ? averageTemperature.toFixed(2) : 'N/A';

  const highestCellVoltage = Math.max(...displayedData.batteryVoltages);
  const lowestCellVoltage = Math.min(...displayedData.batteryVoltages);
  const averageCellVoltage = displayedData.batteryVoltages.length > 0 
    ? displayedData.batteryVoltages.reduce((acc, curr) => acc + curr, 0) / displayedData.batteryVoltages.length 
    : 0;

  // Format to two decimal places
  const highestVoltage = isFinite(highestCellVoltage) ? highestCellVoltage.toFixed(2) : 'N/A';
  const lowestVoltage = isFinite(lowestCellVoltage) ? lowestCellVoltage.toFixed(2) : 'N/A';
  const averageVoltage = isFinite(averageCellVoltage) ? averageCellVoltage.toFixed(2) : 'N/A';


  // Function to change the active tab
  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
  };  

  const packetHandlers = {
    1: (values) => { // IMU Angular velocities for Rear, Center, Front
      dispatch({ type: 'UPDATE_IMU_DATA', payload: { position: 'rear', sensorType: 'gyroscope', data: { x: values[0], y: values[1], z: values[2] } } });
      dispatch({ type: 'UPDATE_IMU_DATA', payload: { position: 'center', sensorType: 'gyroscope', data: { x: values[3], y: values[4], z: values[5] } } });
      dispatch({ type: 'UPDATE_IMU_DATA', payload: { position: 'front', sensorType: 'gyroscope', data: { x: values[6], y: values[7], z: values[8] } } });
    },
    2: (values) => { // IMU Accelerations for Rear, Center, Front
      dispatch({ type: 'UPDATE_IMU_DATA', payload: { position: 'rear', sensorType: 'accelerometer', data: { x: values[0], y: values[1], z: values[2] } } });
      dispatch({ type: 'UPDATE_IMU_DATA', payload: { position: 'center', sensorType: 'accelerometer', data: { x: values[3], y: values[4], z: values[5] } } });
      dispatch({ type: 'UPDATE_IMU_DATA', payload: { position: 'front', sensorType: 'accelerometer', data: { x: values[6], y: values[7], z: values[8] } } });
    },
    3: (values) => { // Gap Height Sensors: 4 vertical + 4 lateral
      // Array format: [vert1, vert2, vert3, vert4, lat1, lat2, lat3, lat4]
      dispatch({ type: 'UPDATE_GAP_HEIGHT_SENSORS', payload: values.slice(0, 8) });
    },
    4: (values) => { // Temperature sensors: Front Hub (4), Center Hub (2), Rear Hub (4)
      dispatch({ type: 'UPDATE_TEMP_SENSORS', payload: {
        frontHub: {
          leftYokeFront: values[0],
          leftYokeBack: values[1],
          rightYokeFront: values[2],
          rightYokeBack: values[3]
        },
        centerHub: {
          limLeft: values[4],
          limRight: values[5]
        },
        rearHub: {
          leftYokeFront: values[6],
          leftYokeBack: values[7],
          rightYokeFront: values[8],
          rightYokeBack: values[9]
        }
      }});
    },
    5: (values) => { // Hall Effect sensors: Front Hub (5), Center Hub (2), Rear Hub (5)
      dispatch({ type: 'UPDATE_HALL_EFFECT_SENSORS', payload: {
        frontHub: {
          leftYokeFront: values[0],
          leftYokeBack: values[1],
          rightYokeFront: values[2],
          rightYokeBack: values[3],
          limCenter: values[4]
        },
        centerHub: {
          limLeft: values[5],
          limRight: values[6]
        },
        rearHub: {
          leftYokeFront: values[7],
          leftYokeBack: values[8],
          rightYokeFront: values[9],
          rightYokeBack: values[10],
          limCenter: values[11]
        }
      }});
    },
    6: (values) => { // Battery Voltages: 144 cells (18 rows × 8 columns)
      dispatch({ type: 'UPDATE_BATTERY_VOLTAGES', payload: values.slice(0, 144) });
    }
  };

  // Generate random dummy data for packet types not connected to real sensors
  const rand = (min, max) => Math.random() * (max - min) + min;

  const dispatchDummyData = () => {
    // IMU Gyroscope: 9 values, angular velocity in deg/s
    packetHandlers[1]([
      rand(-2, 2), rand(-2, 2), rand(-1, 1),
      rand(-2, 2), rand(-2, 2), rand(-1, 1),
      rand(-2, 2), rand(-2, 2), rand(-1, 1)
    ]);
    // IMU Accelerometer: 9 values, m/s^2 (Z ~9.81 gravity)
    packetHandlers[2]([
      rand(-0.15, 0.15), rand(-0.15, 0.15), rand(9.75, 9.85),
      rand(-0.15, 0.15), rand(-0.15, 0.15), rand(9.75, 9.85),
      rand(-0.15, 0.15), rand(-0.15, 0.15), rand(9.75, 9.85)
    ]);
    // Gap Height: 8 values, mm (levitating ~8-12mm)
    packetHandlers[3]([
      rand(9, 11), rand(9, 11), rand(9, 11), rand(9, 11),
      rand(9, 11), rand(9, 11), rand(9, 11), rand(9, 11)
    ]);
    // Battery: 144 cells, nominal 3.5-3.9V
    packetHandlers[6](Array.from({length: 144}, () => rand(3.55, 3.85)));
  };  

    // Utility function to extract sensor values from a data string
  const extractSensorValues = (dataString) => {
    // This regex matches both integer and floating-point numbers
    const sensorRegex = /-?\d+(\.\d+)?/g; 
    const matches = dataString.match(sensorRegex);
    return matches ? matches.map(parseFloat) : [];
  };

  const EXPECTED_VALUE_COUNTS = { 1: 9, 2: 9, 3: 8, 4: 10, 5: 12, 6: 144 };

  const processSerialData = (dataString) => {
    console.log("Received data:", dataString);  // Log the raw data for debugging

    if (!dataString || dataString === "lost") {
        console.error("Connection lost or invalid data.");
        setPodConnected(false);  // Update connection status
        addToConsole("Radio Connection Lost");  // Add to console
        return;
    }

    // Detect merged packets (e.g., "5: ...,0.04: 608,..." where \r\n was lost)
    // Split on pattern where a digit is followed by a colon (packet header)
    const mergedMatch = dataString.match(/^(\d+:\s.+?)(\d+:\s.+)$/);
    if (mergedMatch) {
      console.warn("Merged packets detected, splitting:", dataString);
      processSerialData(mergedMatch[1].trim());
      processSerialData(mergedMatch[2].trim());
      return;
    }

    let packetInfo, data;
    try {
      [packetInfo, data] = dataString.split(':');
      if (!packetInfo || !data) {
        console.error("Data string is not in the expected format:", dataString);
        return;
      }
    } catch (error) {
      console.error("Error splitting data string:", dataString, error);
      return;
    }

    let packetType = parseInt(packetInfo.trim(), 10);
    let values = data.split(',').map(Number);

    let stateCode = values[1];
    if (isNaN(stateCode) || stateCode < 0 || stateCode >= stateDescriptions.length) {
      console.error("Invalid stateCode:", stateCode, "from data:", dataString);
      return;
    }

    // Validate value count before dispatching
    const dataValues = values.slice(3);
    const expectedCount = EXPECTED_VALUE_COUNTS[packetType];
    if (expectedCount && dataValues.length < expectedCount) {
      console.error("Incomplete packet type", packetType, "- expected", expectedCount, "values, got", dataValues.length);
      return;
    }

    let newState = stateDescriptions[stateCode].name || 'Unknown State';
    let healthStatus = values[2] === 1;

    dispatch({ type: 'UPDATE_POD_STATE', payload: newState });
    dispatch({ type: 'UPDATE_POD_HEALTH', payload: healthStatus });

    if (packetHandlers.hasOwnProperty(packetType)) {
      packetHandlers[packetType](dataValues); // Pass only the data values
    }

    // Fill in dummy data for sensor types not connected (1, 2, 3, 6)
    if (packetType === 4 || packetType === 5) {
      dispatchDummyData();
    }

    // Save to MongoDB if enabled and connected
    if (saveToMongoDB && mongoDBConnected) {
      const sensorData = {
        packetType,
        stateCode,
        healthStatus,
        values: values.slice(3)
      };
      
      mongoDBService.saveSensorData(
        packetType,
        newState,
        healthStatus,
        sensorData,
        dataString
      ).catch(error => {
        console.error('Failed to save to MongoDB:', error);
      });
    }
  };
  

  const openSerialPort = async () => {
    if (port) {
      console.log("Serial port is already opened");
      return;
    }

    try {
      addToConsole("Requesting serial port access...");
      const tempPort = await navigator.serial.requestPort();
      addToConsole("Port selected, opening with 115200 baud...");
      await tempPort.open({ 
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });
      setPort(tempPort);
      setPodConnected(true); // Explicitly set when the port is successfully opened
      console.log("Serial port opened");
      addToConsole("✅ Serial port opened successfully!");
      readSerialData(tempPort); // Pass port directly instead of relying on state
    } catch (error) {
      console.error("Failed to open serial port:", error);
      setPodConnected(false); // Set to false if opening the port fails
      addToConsole(`❌ Failed to open serial port: ${error.message || error}`);
    }
};
  
  const readSerialData = async (serialPort) => {
    const portToUse = serialPort || port;
    
    if (!portToUse) {
      console.log("Serial port is not set");
      addToConsole("⚠️ Serial port is not set");
      return;
    }
  
    if (reader) {
      console.log("Reader is already in use");
      return;
    }

    try {
      const newReader = portToUse.readable.getReader();
      setReader(newReader);
      addToConsole("📡 Listening for data from STM32...");

      const textDecoder = new TextDecoder("utf-8", { stream: true });
      let buffer = "";
      const BUFFER_LIMIT = 1024; // Set according to your testing
  
      while (true) {
        const { value, done } = await newReader.read();
        if (done) {
          // Ensure remaining buffer is processed before closing
          if (buffer.length > 0) {
            processSerialData(buffer);
          }
          newReader.releaseLock();
          setReader(null);
          break;
        }
  
        const text = textDecoder.decode(value, { stream: true });
        buffer += text;
  
        if (buffer.length > BUFFER_LIMIT) {
          console.warn("Buffer limit reached, data might be lost.");
          // Optionally process what you can before clearing
          processSerialData(buffer);
          buffer = ""; // Clear buffer after processing to handle new data
        }
  
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.substring(0, newlineIndex + 1);
          setFileWriterData(line);
          processSerialData(line.trim());
          buffer = buffer.substring(newlineIndex + 1);
        }
      }
    } catch (error) {
      console.error("Error reading from serial port:", error);
      setPodConnected(false);
      if (reader) {
        reader.releaseLock();
      }
      setReader(null);
    }
  };

  // Function to send the idle command
  const sendIdleCommand = useCallback(async () => {
    if (!port || !port.writable || !isSendingIdle || !idleCommandAllowed) {
      console.log("Cannot send idle command, port not writable or not allowed.");
      return;
    }
    try {
      const writer = port.writable.getWriter();
      setCommand('8')
      const data = new TextEncoder().encode('8\n');
      await writer.write(data);
      writer.releaseLock();
    } catch (error) {
      console.error("Error sending idle command:", error);
    }
  }, [port, isSendingIdle, idleCommandAllowed]);

  // Set up an interval for sending the idle command
  useEffect(() => {
    const interval = setInterval(() => {
      if (isSendingIdle && idleCommandAllowed) {
        sendIdleCommand();
      }
    }, 1000); // Every second, send an idle command if allowed

    return () => clearInterval(interval);
  }, [sendIdleCommand, isSendingIdle, idleCommandAllowed]);

  // Send command function updated to prevent idle command during command sending
  const sendCommand = useCallback(async (commandText, commandCode, targetState = '', initialCall = false) => {
    setIsSendingIdle(false);
    setIdleCommandAllowed(false); // Disallow idle command sending when a command is being sent
    setCurrentCommand({ commandText, commandCode, targetState });
    setKeepSendingCommand(true);

    if (!port || !port.writable) {
      if (initialCall) {
        addToConsole(`Port is not open or writable. Could not send command: '${commandText}'`);
      }
      return;
    }
    try {
      if (initialCall) {
        console.log(`Attempting to send command: ${commandText}, ${commandCode}`);
        addToConsole(`Attempting to send command: ${commandText}, ${commandCode}`);
      }
      setCommand(commandCode)
      const writer = port.writable.getWriter();
      const data = new TextEncoder().encode(`${commandCode}\n`);
      await writer.write(data);
      writer.releaseLock();
    } catch (error) {
      console.error("Error sending command:", error);
      addToConsole(`Failed to send command: ${commandText}`);
    } finally {
      setIsSendingIdle(true);
    }
  }, [port]);
  
  useEffect(() => {
    if (displayedData.podState === currentCommand.targetState) {
      setIdleCommandAllowed(true);
    }
    let commandInterval;
    if (keepSendingCommand && currentCommand.targetState) {
      if (displayedData.podState !== currentCommand.targetState) {
        commandInterval = setInterval(() => {
          // Call sendCommand without the initialCall flag after the first time
          sendCommand(currentCommand.commandText, currentCommand.commandCode, currentCommand.targetState);
        }, 100); // Continuously send command every second until state changes
      } else {
        addToConsole(`Command '${currentCommand.commandText}, ${currentCommand.commandCode}' sent successfully.`);
        clearInterval(commandInterval);
        setKeepSendingCommand(false);
        setCurrentCommand({ commandText: '', commandCode: '', targetState: '' });
      }
    }
  
    return () => clearInterval(commandInterval);
  }, [keepSendingCommand, currentCommand, displayedData.podState, sendCommand]);

  // Effect to process buffered data at regular intervals
  useEffect(() => {
    const processDataInterval = setInterval(() => {
      if (bufferedData.length > 0) {
        dispatch({ type: 'UPDATE_SENSORS', payload: bufferedData });
        setBufferedData([]);
      }
    }, dataProcessingInterval);

    return () => clearInterval(processDataInterval);
  }, [bufferedData]);

  // Effect to start reading data when the port is set
  useEffect(() => {
    readSerialData();

    return () => {
      if (reader) {
        reader.cancel();
        reader.releaseLock();
      }
      if (port) {
        port.close();
      }
    };
  }, [port]);

  useEffect(() => {
    const handleKeyDown = (event) => {
        if (event.key === " ") {
            event.preventDefault(); // Prevent default behavior if needed
            setSpacePressCount(prevCount => {
                if (prevCount === 2) {
                    sendCommand('Emergency Stop', '7', 'Stopped', true);
                    return 0; // Reset counter after sending command
                }
                return prevCount + 1;
            });
        }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (spaceTimeoutRef.current) {
            clearTimeout(spaceTimeoutRef.current);
        }
    };
}, [sendCommand]);

useEffect(() => {
  if (spacePressCount > 0) {
      spaceTimeoutRef.current = setTimeout(() => {
          setSpacePressCount(0); // Reset count after 1 second of inactivity
      }, 1000); // Adjust timeout as necessary

      return () => {
          if (spaceTimeoutRef.current) {
              clearTimeout(spaceTimeoutRef.current);
          }
      };
  }
}, [spacePressCount]);


  function formatNumberWithSign(number) {
    // Ensure the number has exactly two decimal places
    const fixedNumber = number.toFixed(2);
    // Prepend a plus sign for positive numbers
    return number >= 0 ? `+${fixedNumber}` : fixedNumber;
  }

  return (
    <div className="App">
      <div className="navbar-top">
        <img src={logo} className="logo" alt="Logo" />
        <button 
          className="sidebar-toggle-btn" 
          onClick={() => setSidebarVisible(!sidebarVisible)}
          title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
        >
          {sidebarVisible ? '›' : '‹'}
        </button>
      </div>
      <div className="content">
        <div className="container">
          <div className="main-content">
            {!podConnected && (
              <div className="disconnected-banner">
                Pod Disconnected
              </div>
            )}
            <div className="state-pills-container">
              <div className="state-pills-bar">
                {stateDescriptions.map(state => (
                  <div key={state.name} className={`state-pill ${displayedData.podState === state.name ? "active" : ""}`}>
                    {state.name}
                  </div>
                ))}

                {/* Dynamically generate buttons for the active state */}
                {stateDescriptions
                  .filter(state => state.name === displayedData.podState)
                  .flatMap(state => state.commands)
                  .map((command, index) => (
                    <button key={index} className="state-change-button" onClick={() => sendCommand(command.text, command.command, command.targetState, true)}>
                      {command.text}
                    </button>
                ))}
              </div>
            </div>

            <div className="hero-section">
              <div className="half1">
                <div className="col1">
                  <div className="button-section">
                    {/* Navbar with buttons */}
                    <button onClick={openSerialPort}>Open Serial Port</button>
                    <FileWriter data={fileWriterData} sentData={commandToBeSent} />
                    <button className="emergency-stop-btn" onClick={() => sendCommand('Emergency Stop', '7', 'Stopped', true)}>Emergency Stop</button>
                  </div>
                  
                  <div className="pod-image-container">
                    <img src={podImage} alt="Pod" className="pod-image" />
                  </div>

                  {/* <div className="pod-image-container">
                    <div className="pod-status-grid">
                      <div className="status-item">
                        <div className={`status-indicator ${podStatus.BMS.toLowerCase()}`}></div>
                        <span>BMS: {podStatus.BMS}</span>
                      </div>
                      <div className="status-item">
                        <div className={`status-indicator ${podStatus.CCU.toLowerCase()}`}></div>
                        <span>CCU: {podStatus.CCU}</span>
                      </div>
                      <div className="status-item">
                        <div className={`status-indicator ${podStatus.VCU.toLowerCase()}`}></div>
                        <span>VCU: {podStatus.VCU}</span>
                      </div>
                      <div className="status-item">
                        <div className={`status-indicator ${podStatus.brakes.toLowerCase()}`}></div>
                        <span>Brakes: {podStatus.brakes}</span>
                      </div>
                    </div>
                  </div> */}
                </div>

                <div className="col2">
                  <div className="top-middle-section">
                    <div className="speed-acceleration-section">
                      <div className="progress-bars">
                        <div className="progress-bar">
                          <h5 style={{margin: 0}}>Acceleration</h5>
                          <SemiCircleProgressBar 
                            percentage={Math.abs(displayedData.imuData.front.accelerometer.x * 10)}
                            diameter={150} 
                            showPercentValue={false}
                            strokeWidth={20} 
                            background={"#7d818a"} 
                            className="progressBar" 
                            style={{ right: "100" }} 
                          />
                          <p className="unit">m/s²</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="sensor-data-section">
                      <h5 style={{textAlign: 'center'}}>Vertical (mm)</h5>
                      <div className="barsContainer">
                      {displayedData.gapHeightSensors.slice(0, 4).map((gapHeight, index) => (
                          <div key={`gapHeight-${index}`}>
                            <div className="labelSide">20mm</div>
                            <div className="gapHeightBarContainer">
                              {/* Invert the moving bar's position logic */}
                              <div
                                className="movingBar"
                                style={{ 
                                  top: `${(Math.min(gapHeight, 20) / 20 * 100)}%`, // Invert movement
                                  transition: 'top 0.3s ease', // Smooth transition for the movement
                                  backgroundColor: gapHeight < 8 ? '#00FF00' :  // Green for 0-7
                                    gapHeight < 13 ? '#FFFF00' : // Yellow for 8-12
                                    '#FF0000' // Red for 13-20
                                }}
                              ></div>
                            </div>
                            <div className="valueIndicator">
                              {gapHeight.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Temperature Sensors Section */}
                  <div className="sensor-data-section temperature-grid-section">
                    <h4>Temperature Sensors (°C)</h4>
                    <div className="temp-sensors-grid">
                      {/* Front Hub */}
                      <div className="hub-section">
                        <h5>Front Hub</h5>
                        <div className="temp-grid">
                          <div className="temp-item">
                            <span className="temp-label">L Yoke F</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.frontHub.leftYokeFront > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.frontHub.leftYokeFront.toFixed(1)}
                            </span>
                          </div>
                          <div className="temp-item">
                            <span className="temp-label">L Yoke B</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.frontHub.leftYokeBack > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.frontHub.leftYokeBack.toFixed(1)}
                            </span>
                          </div>
                          <div className="temp-item">
                            <span className="temp-label">R Yoke F</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.frontHub.rightYokeFront > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.frontHub.rightYokeFront.toFixed(1)}
                            </span>
                          </div>
                          <div className="temp-item">
                            <span className="temp-label">R Yoke B</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.frontHub.rightYokeBack > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.frontHub.rightYokeBack.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Center Hub */}
                      <div className="hub-section">
                        <h5>Center Hub</h5>
                        <div className="temp-grid">
                          <div className="temp-item">
                            <span className="temp-label">LIM Left</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.centerHub.limLeft > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.centerHub.limLeft.toFixed(1)}
                            </span>
                          </div>
                          <div className="temp-item">
                            <span className="temp-label">LIM Right</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.centerHub.limRight > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.centerHub.limRight.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Rear Hub */}
                      <div className="hub-section">
                        <h5>Rear Hub</h5>
                        <div className="temp-grid">
                          <div className="temp-item">
                            <span className="temp-label">L Yoke F</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.rearHub.leftYokeFront > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.rearHub.leftYokeFront.toFixed(1)}
                            </span>
                          </div>
                          <div className="temp-item">
                            <span className="temp-label">L Yoke B</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.rearHub.leftYokeBack > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.rearHub.leftYokeBack.toFixed(1)}
                            </span>
                          </div>
                          <div className="temp-item">
                            <span className="temp-label">R Yoke F</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.rearHub.rightYokeFront > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.rearHub.rightYokeFront.toFixed(1)}
                            </span>
                          </div>
                          <div className="temp-item">
                            <span className="temp-label">R Yoke B</span>
                            <span className="temp-value" style={{color: displayedData.tempSensors.rearHub.rightYokeBack > 80 ? '#f87171' : '#4ade80'}}>
                              {displayedData.tempSensors.rearHub.rightYokeBack.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="console" ref={consoleRef}>
                  <h4>Console</h4>
                  <h4>*PRESS SPACE BAR 3 TIMES TO EMERGENCY STOP*</h4>
                  <h4>Use ctrl + '+' or ctrl + '-' to resize GUI</h4>
                  {consoleMessages.map((msg, index) => (
                    <p key={index}>{msg}</p>
                  ))}
                </div>
              </div>

              <div className="col3">
                <div className="sensor-data-section">
                  <h4>Battery</h4>
                  <h5>Cell Voltage</h5>
                  <table>
                    <thead>
                      <tr>
                        <th className="numeric-column">Low</th>
                        <th className="numeric-column">High</th>
                        <th className="numeric-column">Average</th>
                      </tr>
                    </thead>
                    <tbody>
                          <tr>
                            <td className="numeric-column" style={{color: parseFloat(lowestVoltage) < 3.0 ? '#f87171' : '#4ade80'}}>{lowestVoltage}</td>
                            <td className="numeric-column" style={{color: parseFloat(highestVoltage) > 4.2 ? '#f87171' : '#4ade80'}}>{highestVoltage}</td>
                            <td className="numeric-column">{averageVoltage}</td>
                          </tr>
                    </tbody>
                  </table>
                  <h5>Resistance</h5>
                  <table>
                    <thead>
                      <tr>
                        <th className="numeric-column">Low</th>
                        <th className="numeric-column">High</th>
                        <th className="numeric-column">Average</th>
                      </tr>
                    </thead>
                    <tbody>
                          <tr>
                            <td className="numeric-column">FILLER</td>
                            <td className="numeric-column">FILLER</td>
                            <td className="numeric-column">FILLER</td>
                          </tr>
                    </tbody>
                </table>
                <h5>Pack </h5>
                  <table>
                    <thead>
                      <tr>
                        <th className="numeric-column">Low</th>
                        <th className="numeric-column">High</th>
                        <th className="numeric-column">Average</th>
                      </tr>
                    </thead>
                    <tbody>
                          <tr>
                            <td className="numeric-column">FILLER</td>
                            <td className="numeric-column">FILLER</td>
                            <td className="numeric-column">FILLER</td>
                          </tr>
                    </tbody>
                </table>
                </div>
                <div className="sensor-data-section">
                  <h4>Temperature</h4>
                  <table>
                    <thead>
                      <tr>
                        <th className="numeric-column">Low</th>
                        <th className="numeric-column">High</th>
                        <th className="numeric-column">Average</th>
                      </tr>
                    </thead>
                    <tbody>
                          <tr>
                            <td className="numeric-column" style={{color: parseFloat(lowTemp) > 80 ? '#f87171' : '#4ade80'}}>{lowTemp}</td>
                            <td className="numeric-column" style={{color: parseFloat(highTemp) > 80 ? '#f87171' : '#4ade80'}}>{highTemp}</td>
                            <td className="numeric-column">{avgTemp}</td>
                          </tr>
                    </tbody>
                  </table>
                </div>
                <div className="sensor-data-section">
                  <h4>Braking, Embedded</h4>
                  <table>
                    <thead>
                      <tr>
                        <th className="numeric-column">Low</th>
                        <th className="numeric-column">High</th>
                        <th className="numeric-column">Average</th>
                      </tr>
                    </thead>
                    <tbody>
                          <tr>
                            <td className="numeric-column">{lowTemp}</td>
                            <td className="numeric-column">{highTemp}</td>
                            <td className="numeric-column">{avgTemp}</td>
                          </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className={`side-panel ${!sidebarVisible ? 'hidden' : ''}`}>
            <div className="tabs">
              <button onClick={() => handleTabChange('sensors')}>Sensors</button>
              <button onClick={() => handleTabChange('battery')}>Battery Data</button>
            </div>

            <div className={`tab-content ${activeTab === 'sensors' ? 'active-tab-content' : ''}`}>
              <div className="sensor-data-section">
                <h4>IMU Data</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Pos.</th>
                      <th>Sensor</th>
                      <th className="numeric-column">X</th>
                      <th className="numeric-column">Y</th>
                      <th className="numeric-column">Z</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(displayedData.imuData).map(([position, sensors]) => (
                      <React.Fragment key={position}>
                        <tr>
                          <td rowSpan="2" style={{textTransform: 'capitalize', fontWeight: 500}}>{position}</td>
                          <td>Accelerometer</td>
                          <td className="numeric-column" style={{color: Math.abs(sensors.accelerometer.x) > 10 ? '#f87171' : '#d1d5db'}}>{sensors.accelerometer.x.toFixed(2)}</td>
                          <td className="numeric-column" style={{color: Math.abs(sensors.accelerometer.y) > 10 ? '#f87171' : '#d1d5db'}}>{sensors.accelerometer.y.toFixed(2)}</td>
                          <td className="numeric-column" style={{color: Math.abs(sensors.accelerometer.z) > 10 ? '#f87171' : '#d1d5db'}}>{sensors.accelerometer.z.toFixed(2)}</td>
                          <td style={{color: '#9ca3af', fontSize: '0.75rem'}}>m/s²</td>
                        </tr>
                        <tr>
                          <td>Gyroscope</td>
                          <td className="numeric-column">{sensors.gyroscope.x.toFixed(2)}</td>
                          <td className="numeric-column">{sensors.gyroscope.y.toFixed(2)}</td>
                          <td className="numeric-column">{sensors.gyroscope.z.toFixed(2)}</td>
                          <td style={{color: '#9ca3af', fontSize: '0.75rem'}}>rad/s</td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

      
              <div className="sensor-data-section">
                <h4>Gap Height</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Front left</th>
                      <th>Front right</th>
                      <th>Back left</th>
                      <th>Back right</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Vertical Sensors */}
                    <tr>
                      <td>Vertical</td>
                      {displayedData.gapHeightSensors.slice(0, 4).map((gapHeight, index) => (
                        <td key={`vertical-${index}`}>{gapHeight.toFixed(2)}</td>
                      ))}
                    </tr>
                    {/* Lateral Sensors */}
                    <tr>
                      <td>Lateral</td>
                      {displayedData.gapHeightSensors.slice(4, 8).map((gapHeight, index) => (
                        <td key={`lateral-${index}`}>{gapHeight.toFixed(2)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="sensor-data-section">
                <h4>Hall Effect Sensors (Oersted)</h4>
                
                {/* Front Hub */}
                <div className="hall-hub-section">
                  <h5>Front Hub</h5>
                  <table>
                    <thead>
                      <tr>
                        <th>L Yoke F</th>
                        <th>L Yoke B</th>
                        <th>R Yoke F</th>
                        <th>R Yoke B</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{displayedData.hallEffectSensors.frontHub.leftYokeFront.toFixed(1)}</td>
                        <td>{displayedData.hallEffectSensors.frontHub.leftYokeBack.toFixed(1)}</td>
                        <td>{displayedData.hallEffectSensors.frontHub.rightYokeFront.toFixed(1)}</td>
                        <td>{displayedData.hallEffectSensors.frontHub.rightYokeBack.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <table>
                    <thead>
                      <tr>
                        <th>LIM Center</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{displayedData.hallEffectSensors.frontHub.limCenter.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Center Hub */}
                <div className="hall-hub-section">
                  <h5>Center Hub</h5>
                  <table>
                    <thead>
                      <tr>
                        <th>LIM Left</th>
                        <th>LIM Right</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{displayedData.hallEffectSensors.centerHub.limLeft.toFixed(1)}</td>
                        <td>{displayedData.hallEffectSensors.centerHub.limRight.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Rear Hub */}
                <div className="hall-hub-section">
                  <h5>Rear Hub</h5>
                  <table>
                    <thead>
                      <tr>
                        <th>L Yoke F</th>
                        <th>L Yoke B</th>
                        <th>R Yoke F</th>
                        <th>R Yoke B</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{displayedData.hallEffectSensors.rearHub.leftYokeFront.toFixed(1)}</td>
                        <td>{displayedData.hallEffectSensors.rearHub.leftYokeBack.toFixed(1)}</td>
                        <td>{displayedData.hallEffectSensors.rearHub.rightYokeFront.toFixed(1)}</td>
                        <td>{displayedData.hallEffectSensors.rearHub.rightYokeBack.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <table>
                    <thead>
                      <tr>
                        <th>LIM Center</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{displayedData.hallEffectSensors.rearHub.limCenter.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className={`tab-content ${activeTab === 'battery' ? 'active-tab-content' : ''}`}>
            <div className="sensor-data-section">
                <h4>Battery Voltages</h4>
                <table>
                  <tbody>
                    {Array.from({ length: 18 }, (_, rowIndex) => rowIndex * 8).map(rowStartIndex => (
                      <tr key={`row-${rowStartIndex / 8}`}>
                        {Array.from({ length: 8 }, (_, colIndex) => rowStartIndex + colIndex).map(cellIndex => (
                          <td key={`cell-${cellIndex}`}>
                            {/* Ensuring that a default value of 0 is displayed */}
                            {displayedData.batteryVoltages[cellIndex]?.toFixed(2) || '0.00'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default App;