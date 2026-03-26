import { lazy } from "react";
import { Route } from "react-router-dom";

const HelpdeskDashboardPage = lazy(() => import("@/pages/helpdesk/HelpdeskDashboardPage"));
const TicketListPage = lazy(() => import("@/pages/helpdesk/TicketListPage"));
const MyTicketsPage = lazy(() => import("@/pages/helpdesk/MyTicketsPage"));
const TicketDetailPage = lazy(() => import("@/pages/helpdesk/TicketDetailPage"));
const KnowledgeBasePage = lazy(() => import("@/pages/helpdesk/KnowledgeBasePage"));

export const helpdeskRoutes = (
  <>
    <Route path="/helpdesk/dashboard" element={<HelpdeskDashboardPage />} />
    <Route path="/helpdesk/tickets" element={<TicketListPage />} />
    <Route path="/helpdesk/my-tickets" element={<MyTicketsPage />} />
    <Route path="/helpdesk/tickets/:id" element={<TicketDetailPage />} />
    <Route path="/helpdesk/kb" element={<KnowledgeBasePage />} />
  </>
);
