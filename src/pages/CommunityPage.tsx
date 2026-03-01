import { useState, useMemo } from 'react';
import { Users, Plus, X, MapPin, ChevronUp, ChevronDown, MessageCircle, ThumbsUp, Shield } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { MOCK_POSTS } from '../data/mockPosts';
import type { CommunityPost, PostCategory } from '../types';
import styles from './CommunityPage.module.css';

const CATEGORY_LABELS: Record<PostCategory, { label: string; emoji: string; badgeClass: string }> = {
    'incident': { label: 'Incident', emoji: '🚨', badgeClass: 'badge-danger' },
    'risk-zone': { label: 'Risk Zone', emoji: '⚠️', badgeClass: 'badge-warning' },
    'lighting': { label: 'Lighting', emoji: '💡', badgeClass: 'badge-warning' },
    'safety-tip': { label: 'Safety Tip', emoji: '🛡️', badgeClass: 'badge-safe' },
    'appreciation': { label: 'Appreciation', emoji: '❤️', badgeClass: 'badge-primary' },
    'general': { label: 'General', emoji: '💬', badgeClass: 'badge-muted' },
};

function PostCard({ post, onUpvote }: { post: CommunityPost; onUpvote: (id: string) => void }) {
    const [expanded, setExpanded] = useState(false);
    const cat = CATEGORY_LABELS[post.category];

    return (
        <article className={styles.postCard}>
            <div className={styles.postHeader}>
                <span className={`badge ${cat.badgeClass}`}>{cat.emoji} {cat.label}</span>
                {post.severity === 'high' && <span className="badge badge-danger">🔴 High Severity</span>}
                {post.severity === 'medium' && <span className="badge badge-warning">🟡 Medium</span>}
                <span className={styles.postTime}>
                    {new Date(post.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            <p className={styles.postContent}>{post.content}</p>

            {post.locationTag && (
                <div className={styles.postLocation}>
                    <MapPin size={12} />
                    {post.locationTag}
                </div>
            )}

            <div className={styles.postFooter}>
                <div className={styles.postAuthor}>
                    <div className={styles.postAvatar}>
                        {post.isAnonymous ? '🎭' : post.author.charAt(0)}
                    </div>
                    <span>{post.isAnonymous ? 'Anonymous' : post.author}</span>
                    {post.isAnonymous && (
                        <span className={styles.privacyTag}>
                            <Shield size={10} />
                            Differential Privacy
                        </span>
                    )}
                </div>

                <div className={styles.postActions}>
                    <button className={styles.actionBtn} onClick={() => onUpvote(post.id)} id={`upvote-${post.id}`}>
                        <ThumbsUp size={14} />
                        {post.upvotes}
                    </button>
                    <button className={styles.actionBtn} onClick={() => setExpanded(!expanded)}>
                        <MessageCircle size={14} />
                        {post.commentCount}
                        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                </div>
            </div>

            {expanded && post.comments.length > 0 && (
                <div className={styles.comments}>
                    {post.comments.map((comment) => (
                        <div key={comment.id} className={styles.comment}>
                            <div className={styles.commentAvatar}>{comment.isAnonymous ? '🎭' : comment.author.charAt(0)}</div>
                            <div className={styles.commentBody}>
                                <span className={styles.commentAuthor}>{comment.isAnonymous ? 'Anonymous' : comment.author}</span>
                                <p className={styles.commentText}>{comment.content}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </article>
    );
}

export function CommunityPage() {
    const { state, dispatch } = useApp();
    const [filterCategory, setFilterCategory] = useState<PostCategory | 'all'>('all');
    const [showCompose, setShowCompose] = useState(false);
    const [composeContent, setComposeContent] = useState('');
    const [composeCategory, setComposeCategory] = useState<PostCategory>('general');
    const [composeLocation, setComposeLocation] = useState('');
    const [composeAnon, setComposeAnon] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const allPosts = useMemo(() => [...(state.communityPosts), ...MOCK_POSTS], [state.communityPosts]);

    const filteredPosts = useMemo(() => {
        let posts = allPosts;
        if (filterCategory !== 'all') posts = posts.filter(p => p.category === filterCategory);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            posts = posts.filter(p => p.content.toLowerCase().includes(q) || (p.locationTag?.toLowerCase().includes(q) ?? false));
        }
        return posts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [allPosts, filterCategory, searchQuery]);

    const handleSubmitPost = () => {
        if (!composeContent.trim()) return;
        dispatch({
            type: 'ADD_POST',
            payload: {
                id: `p-${Date.now()}`,
                content: composeContent,
                category: composeCategory,
                locationTag: composeLocation || null,
                timestamp: new Date().toISOString(),
                upvotes: 0,
                commentCount: 0,
                isAnonymous: composeAnon,
                author: composeAnon ? 'Anonymous' : (state.user?.name ?? 'User'),
                severity: null,
                comments: [],
            },
        });
        setComposeContent('');
        setComposeLocation('');
        setShowCompose(false);
    };

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.title}><Users size={26} /> Community Forum</h1>
                        <p className={styles.subtitle}>Anonymous safety reports, tips, and community support</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowCompose(!showCompose)} id="compose-post-btn">
                        <Plus size={18} />
                        Report / Share
                    </button>
                </div>

                {/* Compose Panel */}
                {showCompose && (
                    <div className={`glass-card ${styles.composePanel}`}>
                        <div className={styles.composePanelHeader}>
                            <h3>Share with Community</h3>
                            <button className="btn btn-ghost" onClick={() => setShowCompose(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className={styles.composeForm}>
                            <select
                                value={composeCategory}
                                onChange={e => setComposeCategory(e.target.value as PostCategory)}
                                className={styles.categorySelect}
                            >
                                {(Object.entries(CATEGORY_LABELS) as [PostCategory, typeof CATEGORY_LABELS[PostCategory]][]).map(([value, { label, emoji }]) => (
                                    <option key={value} value={value}>{emoji} {label}</option>
                                ))}
                            </select>

                            <textarea
                                value={composeContent}
                                onChange={e => setComposeContent(e.target.value)}
                                placeholder="Describe the situation, location, or safety tip... (Tamil or English both welcome)"
                                className={styles.composeTextarea}
                                rows={4}
                                id="compose-content"
                            />

                            <input
                                type="text"
                                value={composeLocation}
                                onChange={e => setComposeLocation(e.target.value)}
                                placeholder="Location tag (optional — e.g. OMR Sholinganallur)"
                                id="compose-location"
                            />

                            <div className={styles.composeFooter}>
                                <label className={styles.anonToggle}>
                                    <label className="toggle-switch">
                                        <input type="checkbox" checked={composeAnon} onChange={e => setComposeAnon(e.target.checked)} />
                                        <span className="toggle-slider" />
                                    </label>
                                    <span className={styles.anonLabel}>
                                        <Shield size={14} />
                                        Post anonymously (differential privacy applied)
                                    </span>
                                </label>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSubmitPost}
                                    disabled={!composeContent.trim()}
                                    id="submit-post-btn"
                                >
                                    Post
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div className={styles.filters}>
                    <input
                        type="search"
                        placeholder="Search posts..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className={styles.searchInput}
                        id="community-search"
                    />
                    <div className={styles.filterChips}>
                        <button
                            className={[styles.chip, filterCategory === 'all' ? styles.chipActive : ''].join(' ')}
                            onClick={() => setFilterCategory('all')}
                        >All</button>
                        {(Object.entries(CATEGORY_LABELS) as [PostCategory, typeof CATEGORY_LABELS[PostCategory]][]).map(([value, { label, emoji }]) => (
                            <button
                                key={value}
                                className={[styles.chip, filterCategory === value ? styles.chipActive : ''].join(' ')}
                                onClick={() => setFilterCategory(value === filterCategory ? 'all' : value)}
                            >
                                {emoji} {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Privacy Notice */}
                <div className={styles.privacyBanner}>
                    <Shield size={14} />
                    All reports use differential privacy — your identity is never linked to a specific location.
                    Aggregate signals improve the Bright-Path Liveliness Index.
                </div>

                {/* Posts Feed */}
                <div className={styles.feed}>
                    {filteredPosts.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Users size={40} style={{ opacity: 0.25 }} />
                            <p>No posts match your filter. Be the first to share!</p>
                        </div>
                    ) : (
                        filteredPosts.map(post => (
                            <PostCard
                                key={post.id}
                                post={post}
                                onUpvote={(id) => dispatch({ type: 'UPVOTE_POST', payload: id })}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
