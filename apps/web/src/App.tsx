import { Navigate, Route, Routes } from 'react-router-dom';

import { environment } from './config/environment';
import { ProtectedRoute } from './features/auth/components/ProtectedRoute';
import { SessionExpiredDialog } from './features/auth/components/SessionExpiredDialog';
import { Login } from './features/auth/pages/Login';
import { Signup } from './features/auth/pages/Signup';
import { UserRole } from './features/auth/types';
import { EventsLayout } from './features/events/components/EventsLayout';
import { EventCatalog } from './features/events/pages/EventCatalog';
import { EventDetailPage } from './features/events/pages/EventDetailPage';
import { GateEventContextPage } from './features/gate/pages/GateEventContextPage';
import { GateEventSelectionPage } from './features/gate/pages/GateEventSelectionPage';
import { AuthenticatedLayout } from './features/navigation/components/AuthenticatedLayout';
import { RoleHomeRedirect } from './features/navigation/components/RoleHomeRedirect';
import { RoleRoute } from './features/navigation/components/RoleRoute';
import { CreateEvent } from './features/organizer/pages/CreateEvent';
import { OrganizerHome } from './features/organizer/pages/OrganizerHome';
import { OrganizerEventDetailPage } from './features/organizer/pages/OrganizerEventDetailPage';
import { ReservationCheckoutPage } from './features/reservations/pages/ReservationCheckoutPage';
import { MyTicketsPage } from './features/tickets/pages/MyTicketsPage';
import { TicketPresentationPage } from './features/tickets/pages/TicketPresentationPage';

interface AppProps {
  publicSignupEnabled?: boolean;
}

export function App({ publicSignupEnabled = environment.publicSignupEnabled }: AppProps) {
  return (
    <>
      <SessionExpiredDialog />
      <Routes>
        <Route path="/" element={<Navigate replace to="/events" />} />

        <Route path="/login" element={<Login publicSignupEnabled={publicSignupEnabled} />} />

        <Route
          path="/signup"
          element={publicSignupEnabled ? <Signup /> : <Navigate replace to="/login" />}
        />

        <Route path="/tickets/shared/:credential" element={<TicketPresentationPage shared />} />

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
              <Route path="/customer/tickets" element={<MyTicketsPage />} />
              <Route path="/customer/tickets/:credential" element={<TicketPresentationPage />} />
            </Route>

            <Route element={<RoleRoute allowedRole={UserRole.Organizer} />}>
              <Route path="/organizer" element={<OrganizerHome />} />
              <Route path="/organizer/events/:eventId" element={<OrganizerEventDetailPage />} />
              <Route path="/organizer/events/new" element={<CreateEvent />} />
            </Route>

            <Route element={<RoleRoute allowedRole={UserRole.Gate} />}>
              <Route path="/gate" element={<GateEventSelectionPage />} />
              <Route path="/gate/events/:eventId" element={<GateEventContextPage />} />
            </Route>

            <Route path="*" element={<RoleHomeRedirect />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
