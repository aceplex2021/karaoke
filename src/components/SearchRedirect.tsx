/**
 * Search Redirect Component
 * 
 * Redirects user to YouTube search results
 * User then shares video back to app via share target
 * 
 * Used in commercial mode (YouTube) only
 */

'use client';

import { useState } from 'react';

interface SearchRedirectProps {
  /**
   * Placeholder text for search input
   */
  placeholder?: string;
  
  /**
   * Button text
   */
  buttonText?: string;
  
  /**
   * Show instructions
   */
  showInstructions?: boolean;
}

export function SearchRedirect({
  placeholder = 'Search for a song...',
  buttonText = '🔍 Search on YouTube',
  showInstructions = true,
}: SearchRedirectProps) {
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    if (!query.trim()) return;

    // Build YouTube search URL
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    
    // Open in new tab/window
    window.open(searchUrl, '_blank');
    
    // Clear input
    setQuery('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Search Input */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          className="input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-primary"
          onClick={handleSearch}
          disabled={!query.trim()}
        >
          {buttonText}
        </button>
      </div>

      {/* Instructions */}
      {showInstructions && (
        <div style={{
          background: '#f8f9fa',
          border: '1px solid #e9ecef',
          borderRadius: '8px',
          padding: '1rem',
          fontSize: '0.9rem',
          color: '#666',
        }}>
          <p style={{ margin: 0, marginBottom: '0.5rem', fontWeight: 600 }}>
            How to add songs:
          </p>
          <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>
              Enter song name and tap "Search on YouTube"
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Find the video you want in YouTube
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Tap the <strong>Share</strong> button (3 dots → Share)
            </li>
            <li>
              Select <strong>"Kara"</strong> from the share menu
            </li>
          </ol>
          <p style={{ margin: 0, marginTop: '0.75rem', fontSize: '0.85rem', color: '#999' }}>
            💡 The video will be automatically added to the queue!
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Quick Search Buttons
 * Shows popular karaoke categories
 */
export function QuickSearchButtons() {
  const categories = [
    '🎤 Karaoke Classics',
    '🎸 Rock',
    '🎹 Pop',
    '🎵 Country',
    '🕺 80s',
    '💃 90s',
    '🎶 Recent Hits',
  ];

  const handleQuickSearch = (category: string) => {
    const searchQuery = `${category.replace(/[^\w\s]/g, '')} karaoke`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    window.open(searchUrl, '_blank');
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: '#666' }}>
        Quick Search:
      </p>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}>
        {categories.map((category) => (
          <button
            key={category}
            className="btn btn-secondary"
            onClick={() => handleQuickSearch(category)}
            style={{
              fontSize: '0.85rem',
              padding: '0.5rem 1rem',
            }}
          >
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}
