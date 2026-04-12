import { Navigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className="spinner" style={{ width:40, height:40 }} />
    </div>
  );
  if (!user) return <Navigate to="/" replace />;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content" style={{ background: 'var(--bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}
