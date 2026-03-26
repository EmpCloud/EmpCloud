import { lazy } from "react";
import { Route } from "react-router-dom";

const ChatbotPage = lazy(() => import("@/pages/chatbot/ChatbotPage"));

export const chatbotRoutes = (
  <>
    <Route path="/chatbot" element={<ChatbotPage />} />
  </>
);
