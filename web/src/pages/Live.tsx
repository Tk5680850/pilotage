// Live is part of Sessions now (docs/SIMPLIFY.md §5): running sessions are the groups at the top of /sessions.
// Kept as a redirect so old links and bookmarks still land somewhere useful.
import { Navigate } from 'react-router-dom';

export default function Live() {
  return <Navigate to="/sessions" replace />;
}
