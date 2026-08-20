import { Navigate, Route, Routes } from 'react-router-dom';

import { environment } from './config/environment';
import { ProtectedRoute } from './features/auth/components/ProtectedRoute';
import { Login } from './features/auth/pages/Login';
import { Signup } from './features/auth/pages/Signup';
import { AuthenticatedLayout } from './features/navigation/components/AuthenticatedLayout';
import { RoleHomeRedirect } from './features/navigation/components/RoleHomeRedirect';
import { RoleRoute } from './features/navigation/components/RoleRoute';
import { CustomerHome } from './features/navigation/pages/CustomerHome';
import { GateHome } from './features/navigation/pages/GateHome';
import { OrganizerHome } from './features/navigation/pages/OrganizerHome';
import { UserRole } from './features/auth/types';

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
        <Route path="/" element={<RoleHomeRedirect />} />
        <Route element={<AuthenticatedLayout />}>
          <Route element={<RoleRoute allowedRole={UserRole.Customer} />}>
            <Route path="/customer" element={<CustomerHome />} />
          </Route>
          <Route element={<RoleRoute allowedRole={UserRole.Organizer} />}>
            <Route path="/organizer" element={<OrganizerHome />} />
          </Route>
          <Route element={<RoleRoute allowedRole={UserRole.Gate} />}>
            <Route path="/gate" element={<GateHome />} />
          </Route>
          <Route path="*" element={<RoleHomeRedirect />} />
        </Route>
      </Route>
    </Routes>
  );
}
