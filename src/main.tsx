import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

/* Clickjacking defense, layer 2 (runtime). X-Frame-Options can only be set
   by a server, so on hosts that don't send it this frame-buster takes over. */
if (window.self !== window.top) {
  try {
    window.top!.location.href = window.self.location.href;
  } catch {
    document.documentElement.style.display = "none";
    throw new Error("Refusing to render inside a foreign frame.");
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
