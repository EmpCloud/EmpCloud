import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
import "./lib/i18n";
import { useAuthStore } from "@/lib/auth-store";

// ---------------------------------------------------------------------------
// Global error capture — sends client-side errors to the server Log Dashboard
// ---------------------------------------------------------------------------

function reportClientError(error: {
  message: string;
  stack?: string;
  url?: string;
  component?: string;
  level?: string;
}) {
  const userId = useAuthStore.getState().user?.id;
  fetch("/api/v1/admin/logs/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...error,
      userId,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      url: error.url || window.location.href,
      level: error.level || "error",
    }),
  }).catch(() => {}); // Fire and forget — never let reporting cause more errors
}

// Catch uncaught JS errors
window.addEventListener("error", (event) => {
  reportClientError({
    message: event.message,
    stack: event.error?.stack,
    url: window.location.href,
  });
});

// Catch unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  reportClientError({
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack,
    url: window.location.href,
  });
});

// Export for use in api/client.ts
export { reportClientError };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
