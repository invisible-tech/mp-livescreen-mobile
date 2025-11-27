import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTimerReturn {
  duration: number;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
  formattedTime: string;
}

export const useTimer = (): UseTimerReturn => {
  const [duration, setDuration] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTime = useCallback((ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num: number): string => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }, []);

  const start = useCallback(() => {
    if (!isRunning) {
      startTimeRef.current = Date.now() - duration;
      setIsRunning(true);
    }
  }, [isRunning, duration]);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setDuration(0);
    startTimeRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setDuration(Date.now() - startTimeRef.current);
        }
      }, 100);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  return {
    duration,
    isRunning,
    start,
    stop,
    reset,
    formattedTime: formatTime(duration),
  };
};

export default useTimer;

