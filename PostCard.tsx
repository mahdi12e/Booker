import { Link } from 'react-router-dom';
import type { PostSummary } from './types';
import { TYPE_NAME, formatDate } from './utils';
import Avatar from './Avatar';

interface Props {
  post: PostSummary;
  owner?: boolean;
  showAuthor?: boolean;
  onDelete?: (id: string) => void;
}

export default function PostCard({ post, owner, showAuthor = true, onDelete }: Props) {
  const date = formatDate(post.published_at ?? post.updated_at);
  return (
    <article className={`card card--${post.type}`}>
      <div className="card__tags">
        <span className="tag">{TYPE_NAME[post.type]}</span>
        {post.visibility !== 'public' && <span className="tag tag--warn">{post.visibility === 'draft' ? 'Draft' : 'Private'}</span>}
      </div>

      {post.type === 'book_part' && <p className="card__book">{post.book_title}</p>}
      <h3 className="card__title">
        <Link to={`/post/${post.id}`}>{post.title}</Link>
      </h3>
      <p className="card__excerpt">{post.excerpt}</p>

      <footer className="card__foot">
        {showAuthor && (
          <Link className="card__author" to={`/@${post.author.username}`}>
            <Avatar name={post.author.name} src={post.author.avatar} size={24} />
            <span>{post.author.name}</span>
          </Link>
        )}
        <time dateTime={new Date(post.published_at ?? post.updated_at).toISOString()}>
          {post.visibility === 'draft' ? `Saved ${date}` : date}
        </time>
        {owner && (
          <span className="card__actions">
            <Link to={`/write?edit=${post.id}`}>Edit</Link>
            {onDelete && (
              <button type="button" className="link link--danger" onClick={() => onDelete(post.id)}>
                Delete
              </button>
            )}
          </span>
        )}
      </footer>
    </article>
  );
}
