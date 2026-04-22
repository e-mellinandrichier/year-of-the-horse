import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/EditorApp.css";
import { EditorApp } from "./ui/EditorApp";
import { ThemeProvider } from "./ui/ThemeContext";
import "./ui/i18n";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <EditorApp />
    </ThemeProvider>
  </StrictMode>
);
