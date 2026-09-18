import { createRoot } from "react-dom/client";
import { App, ErrorBoundary } from "./App.jsx";
import "./app.css";

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
