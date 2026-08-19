import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { MvpLoader } from '../components/MvpLoader';

interface LoadingContextType {
  // Check if a specific task ID is currently executing
  isTaskLoading: (taskId: string) => boolean;
  // Full-screen loading state and message
  isGlobalLoading: boolean;
  globalLoadingMessage: string;
  // Explicit show/hide loader API
  showLoader: (message?: string) => void;
  hideLoader: () => void;
  // Imperative control for full screen loading (e.g. startup)
  startGlobalLoading: (message?: string) => void;
  stopGlobalLoading: () => void;
  // Centralized async wrapper that locks taskId and handles try/finally with zero artificial delay
  executeTask: <T>(
    taskId: string,
    asyncFn: () => Promise<T>,
    options?: {
      isGlobal?: boolean;
      globalMessage?: string;
    }
  ) => Promise<T | null>;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());
  const activeTasksRef = useRef<Set<string>>(new Set());
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [globalLoadingMessage, setGlobalLoadingMessage] = useState('Connecting to Arena...');

  const isTaskLoading = useCallback(
    (taskId: string) => activeTasks.has(taskId) || activeTasksRef.current.has(taskId),
    [activeTasks]
  );

  const startGlobalLoading = useCallback((message = 'Connecting to Arena...') => {
    setGlobalLoadingMessage(message);
    setIsGlobalLoading(true);
  }, []);

  const stopGlobalLoading = useCallback(() => {
    setIsGlobalLoading(false);
  }, []);

  const showLoader = useCallback((message = 'Connecting to Arena...') => {
    startGlobalLoading(message);
  }, [startGlobalLoading]);

  const hideLoader = useCallback(() => {
    stopGlobalLoading();
  }, [stopGlobalLoading]);

  const executeTask = useCallback(
    async <T,>(
      taskId: string,
      asyncFn: () => Promise<T>,
      options?: { isGlobal?: boolean; globalMessage?: string }
    ): Promise<T | null> => {
      // Prevent duplicate executions instantly via ref lock check (0ms overhead)
      if (activeTasksRef.current.has(taskId)) {
        console.warn(`[Smart Loading] Prevented duplicate trigger on task: "${taskId}"`);
        return null;
      }

      // Add task to active lock set
      activeTasksRef.current.add(taskId);
      setActiveTasks((prev) => new Set(prev).add(taskId));

      if (options?.isGlobal) {
        setGlobalLoadingMessage(options.globalMessage || 'Processing request...');
        setIsGlobalLoading(true);
      }

      try {
        const result = await asyncFn();
        return result;
      } finally {
        // ALWAYS clean up task and global state immediately upon completion
        activeTasksRef.current.delete(taskId);
        setActiveTasks((prev) => {
          if (!prev.has(taskId)) return prev;
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        if (options?.isGlobal) {
          setIsGlobalLoading(false);
        }
      }
    },
    []
  );

  return (
    <LoadingContext.Provider
      value={{
        isTaskLoading,
        isGlobalLoading,
        globalLoadingMessage,
        showLoader,
        hideLoader,
        startGlobalLoading,
        stopGlobalLoading,
        executeTask,
      }}
    >
      {children}

      {/* Global Full-Screen MVP Esports Branded Loading Overlay */}
      {isGlobalLoading && (
        <MvpLoader message={globalLoadingMessage} fullScreen={true} />
      )}
    </LoadingContext.Provider>
  );
};

export const useSmartLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useSmartLoading must be used within a LoadingProvider');
  }
  return context;
};
