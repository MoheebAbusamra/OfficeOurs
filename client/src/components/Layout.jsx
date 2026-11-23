// [S2] Page frame for logged-in pages: navbar on top, the current page in the middle, footer with credits
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="app">
      <Navbar />
      <main className="main" id="main">
        <Outlet />
      </main>
      <footer className="footer">
        OfficeOurs, a cloud computing project. Holidays by <a href="https://calendarific.com" target="_blank" rel="noreferrer">Calendarific</a>.
      </footer>
    </div>
  );
}
