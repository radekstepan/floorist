import { useState, useCallback, useRef } from 'react';

export function useHistory<T>(initialState: T) {
  const [state, _setState] = useState<T>(initialState);
  const historyRef = useRef<T[]>([initialState]);
  const [pointer, setPointer] = useState(0);

  const setState = useCallback((nextState: T | ((prev: T) => T), saveToHistory = true) => {
    _setState((prev) => {
      const resolvedNext = typeof nextState === 'function' ? (nextState as any)(prev) : nextState;

      if (saveToHistory) {
        // If we are branching from a previous point in history, discard future
        const newHistory = historyRef.current.slice(0, pointer + 1);
        newHistory.push(resolvedNext);
        
        // Limit history size to 50
        while (newHistory.length > 50) {
          newHistory.shift();
        }
        
        historyRef.current = newHistory;
        setPointer(newHistory.length - 1);
      }

      return resolvedNext;
    });
  }, [pointer]);

  const undo = useCallback(() => {
    if (pointer > 0) {
      const nextPointer = pointer - 1;
      setPointer(nextPointer);
      const prevState = historyRef.current[nextPointer];
      _setState(prevState);
      return prevState;
    }
    return null;
  }, [pointer]);

  const redo = useCallback(() => {
    if (pointer < historyRef.current.length - 1) {
      const nextPointer = pointer + 1;
      setPointer(nextPointer);
      const nextState = historyRef.current[nextPointer];
      _setState(nextState);
      return nextState;
    }
    return null;
  }, [pointer]);

  const resetHistory = useCallback((newState: T) => {
    historyRef.current = [newState];
    setPointer(0);
    _setState(newState);
  }, []);

  const pushHistory = useCallback((newState: T) => {
    const newHistory = historyRef.current.slice(0, pointer + 1);
    newHistory.push(newState);
    
    while (newHistory.length > 50) {
      newHistory.shift();
    }
    
    historyRef.current = newHistory;
    setPointer(newHistory.length - 1);
  }, [pointer]);

  return {
    state,
    setState,
    undo,
    redo,
    resetHistory,
    pushHistory,
    canUndo: pointer > 0,
    canRedo: pointer < historyRef.current.length - 1,
  };
}
