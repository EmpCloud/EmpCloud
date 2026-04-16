import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";

const ForumPage = lazy(() => import("@/pages/forum/ForumPage"));
const CategoryPostsPage = lazy(() => import("@/pages/forum/CategoryPostsPage"));
const PostDetailPage = lazy(() => import("@/pages/forum/PostDetailPage"));
const CreatePostPage = lazy(() => import("@/pages/forum/CreatePostPage"));
const FeedPage = lazy(() => import("@/pages/feed/FeedPage"));

export const forumRoutes = (
  <>
    <Route path="/feed" element={<FeedPage />} />
    <Route path="/forum" element={<ForumPage />} />
    <Route path="/forum/new" element={<CreatePostPage />} />
    {/* Legacy Forum Dashboard merged into /feed for HR — keep the route as a
        redirect so any bookmarks still land somewhere sensible. */}
    <Route path="/forum/dashboard" element={<Navigate to="/feed" replace />} />
    <Route path="/forum/category/:id" element={<CategoryPostsPage />} />
    <Route path="/forum/post/:id" element={<PostDetailPage />} />
  </>
);
