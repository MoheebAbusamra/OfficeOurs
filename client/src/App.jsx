// All routes in one place, grouped by service and protected by role
import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';

// S1 Scheduling
import Login from '@/pages/scheduling/Login';
import Register from '@/pages/scheduling/Register';
import BrowseSlots from '@/pages/scheduling/BrowseSlots';
import ManageSlots from '@/pages/scheduling/ManageSlots';
import Dashboard from '@/pages/scheduling/Dashboard';
// S2 Requests
import NewRequest from '@/pages/requests/NewRequest';
import MyRequests from '@/pages/requests/MyRequests';
import Inbox from '@/pages/requests/Inbox';
import Faqs from '@/pages/requests/Faqs';
// S3 Queue
import StudentQueue from '@/pages/queue/StudentQueue';
import InstructorQueue from '@/pages/queue/InstructorQueue';
import History from '@/pages/queue/History';
import CheckIn from '@/pages/queue/CheckIn';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/check-in/:token" element={<CheckIn />} />

      {/* Student */}
      <Route element={<ProtectedRoute role="student"><Layout /></ProtectedRoute>}>
        <Route path="/student/slots" element={<BrowseSlots />} />
        <Route path="/student/requests/new" element={<NewRequest />} />
        <Route path="/student/requests" element={<MyRequests />} />
        <Route path="/student/queue/:requestId" element={<StudentQueue />} />
        <Route path="/student/history" element={<History />} />
      </Route>

      {/* Instructor */}
      <Route element={<ProtectedRoute role="instructor"><Layout /></ProtectedRoute>}>
        <Route path="/instructor/dashboard" element={<Dashboard />} />
        <Route path="/instructor/slots" element={<ManageSlots />} />
        <Route path="/instructor/inbox" element={<Inbox />} />
        <Route path="/instructor/faqs" element={<Faqs />} />
        <Route path="/instructor/queue/:slotId" element={<InstructorQueue />} />
        <Route path="/instructor/history" element={<History />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  );
}
