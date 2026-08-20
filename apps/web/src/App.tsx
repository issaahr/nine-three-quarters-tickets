import { Navigate, Route, Routes } from 'react-router-dom';

import { environment } from './config/environment';
import { ProtectedRoute } from './features/auth/components/ProtectedRoute';
import { Login } from './features/auth/pages/Login';
import { Signup } from './features/auth/pages/Signup';
import { Home } from './pages/Home';

interface AppProps {
  publicSignupEnabled?: boolean;
}

export function App({ publicSignupEnabled = environment.publicSignupEnabled }: AppProps) {
  return (
    <Routes>
      <Route path="/login" element={<Login publicSignupEnabled={publicSignupEnabled} />} />
      <Route
        path="/signup"
        element={publicSignupEnabled ? <Signup /> : <Navigate replace to="/login" />}
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Home />} />
      </Route>
    </Routes>
  );
}
