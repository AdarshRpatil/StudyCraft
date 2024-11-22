import React, { useState, useEffect } from "react";
import "./style.css";

const PomodoroTimer = () => {
  const [workTime, setWorkTime] = useState(0);
  const [breakTime, setBreakTime] = useState(0);
  const [timeInSeconds, setTimeInSeconds] = useState(0);
  const [isBreak, setIsBreak] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [timerDisplay, setTimerDisplay] = useState("00:00");
  const [timerInterval, setTimerInterval] = useState(null);

  useEffect(() => {
    if (timeInSeconds > 0) {
      const interval = setInterval(() => {
        setTimeInSeconds((prev) => prev - 1);
      }, 1000);
      setTimerInterval(interval);
      return () => clearInterval(interval);
    } else if (timeInSeconds === 0 && timerRunning) {
      clearInterval(timerInterval);
      playNotificationSound();
      if (isBreak) {
        setMessage("Break over! Time to work again.");
        startWorkSession();
      } else {
        setCycles((prev) => prev + 1);
        if (cycles % 4 === 0) {
          startLongBreak();
        } else {
          startShortBreak();
        }
      }
    }
  }, [timeInSeconds, timerRunning, isBreak, cycles]);

  const startTimer = () => {
    if (!workTime || !breakTime || workTime <= 0 || breakTime <= 0) {
      alert("Please enter valid durations for work and break times.");
      return;
    }
    setMessage("");
    setCycles(0);
    setIsBreak(false);
    setTimeInSeconds(workTime * 60);
    setTimerRunning(true);
  };

  const stopTimer = () => {
    clearInterval(timerInterval);
    setTimerRunning(false);
    setMessage("Timer Stopped.");
  };

  const startWorkSession = () => {
    setIsBreak(false);
    setMessage("Time to work!");
    setTimeInSeconds(workTime * 60);
  };

  const startShortBreak = () => {
    setIsBreak(true);
    setMessage("Time for a short break!");
    setTimeInSeconds(breakTime * 60);
  };

  const startLongBreak = () => {
    setIsBreak(true);
    setMessage("Time for a long break!");
    setTimeInSeconds(15 * 60);
  };

  const updateTimerDisplay = () => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    setTimerDisplay(`${formatTime(minutes)}:${formatTime(seconds)}`);
  };

  const formatTime = (time) => {
    return time < 10 ? `0${time}` : time;
  };

  const playNotificationSound = () => {
    const sound = document.getElementById("notification-sound");
    sound.play();
  };

  useEffect(updateTimerDisplay, [timeInSeconds]);

  return (
    <div className="container">
      <h1><b>Pomodoro Timer</b></h1>
      <div className="input-section">
        <label htmlFor="work-time"><b>Enter work duration (in minutes):</b></label>
        <br />
        <br />
        <input
          type="number"
          id="work-time"
          placeholder="Enter time in minutes"
          min="1"
          value={workTime}
          onChange={(e) => setWorkTime(Number(e.target.value))}
        />
        <br />
        <br />
        <label htmlFor="break-time"><b>Enter break duration (in minutes):</b></label>
        <br />
        <br />
        <input
          type="number"
          id="break-time"
          placeholder="Enter break time in minutes"
          min="1"
          value={breakTime}
          onChange={(e) => setBreakTime(Number(e.target.value))}
        />
        <br />
        <br />
        <button id="start-btn" onClick={startTimer} disabled={timerRunning}>Start Timer</button>
        <button id="stop-btn" className="stop-btn" onClick={stopTimer} disabled={!timerRunning}>Stop Timer</button>
      </div>
      <div id="timer" className="timer">
        <p id="timer-display">{timerDisplay}</p>
      </div>
      <div id="message" className="message">{message}</div>
      <audio id="notification-sound" src="mixkit-urgent-simple-tone-loop-2976.wav" preload="auto"></audio>
    </div>
  );
};

export default PomodoroTimer;
