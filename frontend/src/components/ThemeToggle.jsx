import React, { useRef, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle() {
  const { isDarkMode, toggleTheme } = useTheme();
  const audioRef = useRef(null);

  useEffect(() => {
    // Preload the audio file to ensure it plays instantly
    audioRef.current = new Audio('/theme-switch.mp3');
    // Optional: lower the volume slightly if the button click is too loud
    audioRef.current.volume = 0.5;
  }, []);

  const handleToggle = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio playback prevented', e));
    }
    toggleTheme();
  };

  return (
    <button 
      className={`theme-pill ${isDarkMode ? 'theme-pill-dark' : 'theme-pill-light'}`} 
      onClick={handleToggle}
      title="Toggle Dark Mode"
    >
      <div className="theme-pill-track">
        <span className="theme-pill-text text-day">DAY MODE</span>
        <div className="theme-pill-thumb">
          {isDarkMode ? '🌙' : '☀️'}
        </div>
        <span className="theme-pill-text text-night">NIGHT MODE</span>
      </div>
    </button>
  );
}
