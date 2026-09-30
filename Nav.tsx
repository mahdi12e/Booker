import { Link, NavLink } from 'react-router-dom';
import { useAuth } from './client-auth';
import Logo from './Logo';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 5.5l-2 5-5 2 2-5z',
  pen: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2M19 5l-2 2M7 17l-2 2',
  login: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l4 4-4 4M14 12H4',
  plus: 'M12 5v14M5 12h14'
};

function Icon({ name }: { name: string }) {
  return (
    <svg className="nav__icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

interface Item {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  cta?: boolean;
}

export default function Nav() {
  const { user, loading } = useAuth();

  const items: Item[] = user
    ? [
        { to: '/', label: 'Home', icon: 'home', end: true },
        { to: '/discover', label: 'Discover', icon: 'compass' },
        { to: '/write', label: 'Write', icon: 'pen' },
        { to: `/@${user.username}`, label: 'Profile', icon: 'user' },
        { to: '/settings', label: 'Settings', icon: 'gear' }
      ]
    : [
        { to: '/', label: 'Home', icon: 'home', end: true },
        { to: '/discover', label: 'Explore', icon: 'compass' },
        { to: '/login', label: 'Log In', icon: 'login' },
        { to: '/register', label: 'Create Account', icon: 'plus', cta: true }
      ];

  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="Marginalia home">
        <Logo />
        <span>Marginalia</span>
      </Link>
      {!loading && (
        <nav className="nav" aria-label="Primary">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav__link${it.cta ? ' nav__link--cta' : ''}${isActive ? ' is-active' : ''}`}>
              <Icon name={it.icon} />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
