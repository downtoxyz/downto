"use client";

import { color } from "@/lib/styles";

const GlobalStyles = () => (
  <style>{`
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; -webkit-font-smoothing: antialiased; }

    @keyframes slideUp {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes toastIn {
      from { opacity: 0; transform: translateY(20px) translateX(-50%); }
      to { opacity: 1; transform: translateY(0) translateX(-50%); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes accentGlow {
      0% { border-color: #E8FF5A; box-shadow: 0 0 12px rgba(232,255,90,0.4); }
      100% { border-color: rgba(255,255,255,0.06); box-shadow: none; }
    }
    @keyframes checkGlow {
      0%, 100% { border-color: rgba(90,200,255,0.5); box-shadow: 0 0 12px rgba(90,200,255,0.3); }
      50% { border-color: rgba(90,200,255,0.8); box-shadow: 0 0 20px rgba(90,200,255,0.5); }
    }
    @keyframes addButtonGlow {
      0%, 100% { box-shadow: 0 0 8px rgba(232,255,90,0.4), 0 0 20px rgba(232,255,90,0.2); }
      50% { box-shadow: 0 0 16px rgba(232,255,90,0.6), 0 0 32px rgba(232,255,90,0.3); }
    }

    ::-webkit-scrollbar { width: 0; }

    input::placeholder { color: #444; }
    input:focus { border-color: ${color.accent} !important; }

    button { transition: all 0.15s ease; }
    button:active { transform: scale(0.97); }
  `}</style>
);

export default GlobalStyles;
