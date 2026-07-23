import React, { useRef, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" fill="#f59e0b" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#94a3b8" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export default function ThemeToggle() {
  const { isDarkMode, toggleTheme } = useTheme();
  const audioRef = useRef(null);

  useEffect(() => {
    audioRef.current = new Audio('/theme-switch.mp3');
    audioRef.current.volume = 0.4;
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
        <div className="theme-scenery">
          {isDarkMode ? (
            <div className="night-sky">
              <span className="star s1">✦</span>
              <span className="star s2">✦</span>
              <span className="star s3">✦</span>
            </div>
          ) : (
            <div className="day-sky">
              <span className="bird b1">v</span>
              <span className="bird b2">v</span>
              <span className="tree t1">▲</span>
              <span className="tree t2">▲</span>
            </div>
          )}
        </div>
        
        <div className="theme-pill-thumb">
          {isDarkMode ? <MoonIcon /> : <SunIcon />}
        </div>
      </div>
    </button>
  );
}
