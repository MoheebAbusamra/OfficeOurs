// Page frame for logged-in pages: navbar on top, the current page in the middle, footer
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';

export default function Layout() {
  return (
    <div className="app">
      <Navbar />
      <main className="main" id="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
