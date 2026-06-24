import { lazy } from "react";
import { Route } from "react-router-dom";

const MessagesPage = lazy(() => import("@/pages/messages/MessagesPage"));

export const chatRoutes = (
  <>
    <Route path="/messages" element={<MessagesPage />} />
    <Route path="/messages/:conversationId" element={<MessagesPage />} />
  </>
);
