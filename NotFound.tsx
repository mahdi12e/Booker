import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found · Marginalia';
  }, []);
  return (
    <div className="page page--narrow empty">
      <h1>That page does not exist</h1>
      <p>The link may be mistyped, or the piece may have been removed or made private.</p>
      <Link className="btn btn--primary" to="/">
        Go home
      </Link>
    </div>
  );
}
