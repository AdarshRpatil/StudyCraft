import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css'

const Dashboard = () => {
  const navigate = useNavigate();

  const handleRedirect = () => {
    navigate('/time-table');
  };
  const handleRedirect2 = () => {
    navigate('/Pomodoro-timer');
  };

  return (
    <div className='main'>
      <h2>StudyCraft</h2>
      <div className="p1">
      <button className='box1 box' onClick={handleRedirect}>Generate Timetable</button>
      <button className='box2 box'>
        <a href="http://127.0.0.1:5500/index.html">Pomodoro Timer</a>
      </button>
      </div>
      <div className="p2">
      <button className='box3 box'>
        <a href="http://127.0.0.1:5501/index.html">Task manager</a>
      </button>
      <button className='box4 box'>
        <a href="https://prompt-verse-2-0.vercel.app/" target="_blank" rel="noopener noreferrer">
          Prompt
        </a>
      </button>
      </div>
    </div>
  );
};

export default Dashboard;