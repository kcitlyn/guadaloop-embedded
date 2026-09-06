import "../App.css";
import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";


let start = 0
export default function LiveGraph() {
  const[data,setData] = useState([])
  const[count,setCount] = useState(0)
  useEffect(()=>{
    const interval = setInterval(() => {
      setCount(count + 1);
      const newData = {time:count,value:Math.floor(Math.random() * 1000)}
      start+=1
      if(data.length > 10){
        setData(data.slice(1,10))
      }
      setData(currentData => [...currentData, newData])
  }, 100);
  //Clearing the interval
  return () => clearInterval(interval);
  },[count])

  return (
    <div className="graph_box">
      <ResponsiveContainer width="50%" height="100%">
    <LineChart 
   height={500}
   width={500}
      data={data}
   
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" />
      <YAxis />
      <Tooltip />
      <Legend />
    
      <Line type="monotone" dataKey="value" stroke="#82ca9d" />
    </LineChart>
    </ResponsiveContainer>

    <ResponsiveContainer width="50%" height="100%">
    <LineChart className="live_graph"
   height={500}
   width={500}
      data={data}
     
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" color="white"/>
      <YAxis />
      <Tooltip />
      <Legend />
    
      <Line type="monotone" dataKey="value" stroke="red" />
    </LineChart>
    </ResponsiveContainer>
   
    </div>
  );
}
