import { useState, useEffect, createContext, useContext } from 'react';

const ThemeContext = createContext();

/**
 * Custom hook to manage the application theme (light/dark).
 * Persists selection in localStorage and updates the document's data-theme attribute.
 */
export const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) return savedTheme;
    
    // Fallback to system color scheme preference
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    // Apply the theme attribute used by your CSS selectors
    root.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return { theme, toggleTheme };
};

export const ThemeProvider = ({ children }) => {
  const themeValue = useTheme();
  
  return (
    <ThemeContext.Provider value={themeValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
};

export default useTheme;