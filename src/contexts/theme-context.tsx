import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Available theme colors (multiple shades like Excel)
const themeColors = [
  // Azul
  { name: "Azul Claro", sidebar: "#eff6ff", button: "#60a5fa", text: "#000000" },
  { name: "Azul", sidebar: "#1e3a5f", button: "#2563eb", text: "#ffffff" },
  { name: "Azul Escuro", sidebar: "#0f172a", button: "#1e40af", text: "#ffffff" },
  { name: "Azul Turquesa", sidebar: "#04521eff", button: "#14b8a6", text: "#ffffff" },
  
  // Amarelo
  { name: "Amarelo Claro", sidebar: "#fffbeb", button: "#fbbf24", text: "#000000" },
  { name: "Amarelo", sidebar: "#713f12", button: "#eab308", text: "#000000" },
  { name: "Amarelo Escuro", sidebar: "#422006", button: "#ca8a04", text: "#ffffff" },
  
  // Roxo
  { name: "Roxo Claro", sidebar: "#faf5ff", button: "#a78bfa", text: "#000000" },
  { name: "Roxo", sidebar: "#4c1d95", button: "#7c3aed", text: "#ffffff" },
  { name: "Roxo Escuro", sidebar: "#1e1b4b", button: "#581c87", text: "#ffffff" },
  
  // Verde
  { name: "Verde Claro", sidebar: "#f0fdf4", button: "#4ade80", text: "#000000" },
  { name: "Verde", sidebar: "#064e3b", button: "#16a34a", text: "#ffffff" },
  { name: "Verde Escuro", sidebar: "#052e16", button: "#15803d", text: "#ffffff" },
  
  // Vermelho
  { name: "Vermelho Claro", sidebar: "#fef2f2", button: "#f87171", text: "#000000" },
  { name: "Vermelho", sidebar: "#7f1d1d", button: "#dc2626", text: "#ffffff" },
  { name: "Vermelho Escuro", sidebar: "#450a0a", button: "#b91c1c", text: "#ffffff" },
  
  // Rosa
  { name: "Rosa Claro", sidebar: "#fdf2f8", button: "#f472b6", text: "#000000" },
  { name: "Rosa", sidebar: "#701a39", button: "#db2777", text: "#ffffff" },
  { name: "Rosa Escuro", sidebar: "#500724", button: "#be185d", text: "#ffffff" },
  
  // Preto/Cinza
  { name: "Cinza Claro", sidebar: "#f9fafb", button: "#9ca3af", text: "#000000" },
  { name: "Cinza", sidebar: "#1f2937", button: "#4b5563", text: "#ffffff" },
  { name: "Preto", sidebar: "#000000", button: "#111827", text: "#ffffff" },
  
  // Laranja
  { name: "Laranja Claro", sidebar: "#fff7ed", button: "#fb923c", text: "#000000" },
  { name: "Laranja", sidebar: "#7c2d12", button: "#ea580c", text: "#ffffff" },
  { name: "Laranja Escuro", sidebar: "#431407", button: "#c2410c", text: "#ffffff" },
];

type Theme = typeof themeColors[0];

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(themeColors[0]);

  // Load from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("appTheme");
    if (savedTheme) {
      const parsedTheme = JSON.parse(savedTheme);
      setTheme(parsedTheme);
    }
  }, []);

  // Save to localStorage when theme changes
  useEffect(() => {
    localStorage.setItem("appTheme", JSON.stringify(theme));
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export { themeColors };