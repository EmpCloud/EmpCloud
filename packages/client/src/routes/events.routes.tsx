import { lazy } from "react";
import { Route } from "react-router-dom";

const EventsListPage = lazy(() => import("@/pages/events/EventsListPage"));
const EventDetailPage = lazy(() => import("@/pages/events/EventDetailPage"));
const EventDashboardPage = lazy(() => import("@/pages/events/EventDashboardPage"));
const MyEventsPage = lazy(() => import("@/pages/events/MyEventsPage"));

export const eventRoutes = (
  <>
    <Route path="/events" element={<EventsListPage />} />
    <Route path="/events/my" element={<MyEventsPage />} />
    <Route path="/events/dashboard" element={<EventDashboardPage />} />
    <Route path="/events/:id" element={<EventDetailPage />} />
  </>
);
