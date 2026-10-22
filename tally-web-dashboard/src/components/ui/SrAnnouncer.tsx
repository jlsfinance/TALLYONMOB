import React, { useEffect, useState } from 'react';

/**
 * Screen Reader Announcer — A visually hidden live region for announcing
 * dynamic content updates to assistive technologies.
 *
 * Usage:
 *   const { announce } = useAnnouncer();
 *   announce('Invoice saved successfully');
 *
 * Or use the context provider at app root.
 */

/* ── Context ── */
const AnnouncerContext = React.createContext<{
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
}>({
  announce: () => {},
});

export const useAnnouncer = () => React.useContext(AnnouncerContext);

export const AnnouncerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const announcerRef = React.useRef<AnnouncerHandle>(null);

  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    announcerRef.current?.announce(message, priority);
  };

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      <SrAnnouncer ref={announcerRef} />
    </AnnouncerContext.Provider>
  );
};

/* ── Component ── */

interface AnnouncerHandle {
  announce: (message: string, priority: 'polite' | 'assertive') => void;
}

const SrAnnouncer = React.forwardRef<AnnouncerHandle>((_props, ref) => {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');

  React.useImperativeHandle(ref, () => ({
    announce: (message: string, priority: 'polite' | 'assertive') => {
      if (priority === 'assertive') {
        setAssertiveMessage((prev) => (prev === message ? `${message} ` : message));
      } else {
        setPoliteMessage((prev) => (prev === message ? `${message} ` : message));
      }
    },
  }));

  // Clear announcements after they've been read
  useEffect(() => {
    if (!politeMessage) return;
    const t = setTimeout(() => setPoliteMessage(''), 3000);
    return () => clearTimeout(t);
  }, [politeMessage]);

  useEffect(() => {
    if (!assertiveMessage) return;
    const t = setTimeout(() => setAssertiveMessage(''), 3000);
    return () => clearTimeout(t);
  }, [assertiveMessage]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        borderWidth: 0,
      }}
    >
      {politeMessage}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertiveMessage}
      </div>
    </div>
  );
});

SrAnnouncer.displayName = 'SrAnnouncer';

export { SrAnnouncer };
