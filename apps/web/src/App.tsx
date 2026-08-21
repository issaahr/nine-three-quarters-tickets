import { Navigate, Route, Routes } from 'react-router-dom';

import { environment } from './config/environment';
import { ProtectedRoute } from './features/auth/components/ProtectedRoute';
import { Login } from './features/auth/pages/Login';
import { Signup } from './features/auth/pages/Signup';
import { EventsLayout } from './features/events/components/EventsLayout';
import { EventCatalog } from './features/events/pages/EventCatalog';
import { EventDetailPage } from './features/events/pages/EventDetailPage';
import { AuthenticatedLayout } from './features/navigation/components/AuthenticatedLayout';
import { RoleHomeRedirect } from './features/navigation/components/RoleHomeRedirect';
import { RoleRoute } from './features/navigation/components/RoleRoute';
import { GateHome } from './features/navigation/pages/GateHome';
import { CreateMovieEvent } from './features/organizer/pages/CreateMovieEvent';
import { OrganizerHome } from './features/organizer/pages/OrganizerHome';
import { ReservationCheckoutPage } from './features/reservations/pages/ReservationCheckoutPage';
import { UserRole } from './features/auth/types';

interface AppProps {
  publicSignupEnabled?: boolean;
}

export function App({ publicSignupEnabled = environment.publicSignupEnabled }: AppProps) {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/events" />} />

      <Route path="/login" element={<Login publicSignupEnabled={publicSignupEnabled} />} />

      <Route
        path="/signup"
        element={publicSignupEnabled ? <Signup /> : <Navigate replace to="/login" />}
      />

      <Route element={<EventsLayout />}>
        <Route path="/events" element={<EventCatalog />} />
        <Route path="/events/:eventId" element={<EventDetailPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedLayout />}>
          <Route element={<RoleRoute allowedRole={UserRole.Customer} />}>
            <Route path="/customer" element={<Navigate replace to="/events" />} />
            <Route
              path="/customer/reservations/:reservationId"
              element={<ReservationCheckoutPage />}
            />
          </Route>

          <Route element={<RoleRoute allowedRole={UserRole.Organizer} />}>
            <Route path="/organizer" element={<OrganizerHome />} />
            <Route path="/organizer/events/new" element={<CreateMovieEvent />} />
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
