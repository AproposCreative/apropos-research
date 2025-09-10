import Dashboard from '../components/Dashboard';
import ProtectedRoute from '../components/ProtectedRoute';

export default function Page() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}