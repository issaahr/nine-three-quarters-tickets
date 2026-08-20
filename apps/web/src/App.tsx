import { Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './features/auth/components/ProtectedRoute';
import { Login } from './features/auth/pages/Login';
import { Home } from './pages/Home';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Home />} />
      </Route>
    </Routes>
  );
}
