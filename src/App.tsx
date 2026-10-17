import { AdminPage } from './components/AdminPage';
import { ResidentApp } from './components/ResidentApp';

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin') return <AdminPage />;
  return <ResidentApp />;
}
