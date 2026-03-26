import { lazy } from "react";
import { Route } from "react-router-dom";

const ForumPage = lazy(() => import("@/pages/forum/ForumPage"));
const CategoryPostsPage = lazy(() => import("@/pages/forum/CategoryPostsPage"));
const PostDetailPage = lazy(() => import("@/pages/forum/PostDetailPage"));
const CreatePostPage = lazy(() => import("@/pages/forum/CreatePostPage"));
const ForumDashboardPage = lazy(() => import("@/pages/forum/ForumDashboardPage"));

export const forumRoutes = (
  <>
    <Route path="/forum" element={<ForumPage />} />
    <Route path="/forum/new" element={<CreatePostPage />} />
    <Route path="/forum/dashboard" element={<ForumDashboardPage />} />
    <Route path="/forum/category/:id" element={<CategoryPostsPage />} />
    <Route path="/forum/post/:id" element={<PostDetailPage />} />
  </>
);
