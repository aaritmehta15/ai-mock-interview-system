import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base, #08090d)', color: 'var(--text-primary, #f8fafc)' }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          height: '100vh',
          background: 'var(--bg-base, #08090d)',
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
