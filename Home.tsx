import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './client-auth';
import Feed from './Feed';

export default function Home() {
  const { user } = useAuth();
  useEffect(() => {
    document.title = 'Home · Marginalia';
  }, []);
  const first = user?.name.split(' ')[0] ?? '';
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Welcome back, {first}</h1>
          <p className="muted">Fresh work from writers around the world.</p>
        </div>
        <Link className="btn btn--primary" to="/write">
          Start writing
        </Link>
      </header>
      <Feed type={null} />
    </div>
  );
}
