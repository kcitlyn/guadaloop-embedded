// FileWriter.js
import React, { useState, useEffect } from 'react';
 
const FileWriter = ({ data, sentData }) => {
  const [fileWriter, setFileWriter] = useState(null);
 
  const openFileWriter = async () => {
    try {
      const handle = await window.showSaveFilePicker();
      const writable = await handle.createWritable();
      setFileWriter(writable);
    } catch (error) {
      console.error('Error accessing file system:', error);
    }
  };
 
  const writeDataToFile = async () => {
    if (!fileWriter || !data) return; // Exit if fileWriter or data is not available
  
    try {
      // Get current time without date
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
      // Combine timestamp with data
      const content = `${timestamp}: ${JSON.stringify(data)}\n`;
  
      // Convert content to a Blob object
      const blob = new Blob([content], { type: 'text/plain' });
  
      // Write the Blob to the file
      await fileWriter.write(blob);
  
      console.log('Data written to file successfully');
    } catch (error) {
      console.error('Error writing to file:', error);
    }
  };

  const writeSentDataToFile = async () => {
    if (!fileWriter || !sentData) return; // Exit if fileWriter or data is not available
  
    try {
      // Get current time without date
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
      // Combine timestamp with data
      const content = `${timestamp}: ${JSON.stringify(sentData)}\n`;
  
      // Convert content to a Blob object
      const blob = new Blob([content], { type: 'text/plain' });
  
      // Write the Blob to the file
      await fileWriter.write(blob);
  
      console.log('Data written to file successfully');
    } catch (error) {
      console.error('Error writing to file:', error);
    }
  };
 
  useEffect(() => {
    writeDataToFile(); // Call writeDataToFile whenever there's new data or fileWriter changes
  }, [data, fileWriter]);

  useEffect(() => {
    writeSentDataToFile();
  }, [sentData, fileWriter])
 
  const closeFileWriter = () => {
    if (fileWriter) {
      fileWriter.close(); // Close the file writer
      console.log('FileWriter closed');
      setFileWriter(null); // Reset fileWriter state
    }
  };
 
  return (
    <>
      <button onClick={openFileWriter}>Open File Writer</button>
      <button onClick={closeFileWriter}>Close File Writer</button>
    </>
  );
};
 
export default FileWriter;