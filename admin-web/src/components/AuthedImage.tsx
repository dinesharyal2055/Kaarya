import React, { useEffect, useState } from 'react';

// Mirrors the backend base URL used by VerificationDetail today. Loaded with the
// admin JWT because GET /uploads/verification/* now requires authorization.
const API_URL = 'https://kaarya-4qft.onrender.com';

interface AuthedImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Renders a backend-served image that requires the admin JWT.
 * A plain <img> tag cannot attach an Authorization header, so the bytes are
 * fetched with the token and presented as a blob object URL.
 */
export default function AuthedImage({ src, alt, className }: AuthedImageProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const full = src.startsWith('http') ? src : `${API_URL}${src}`;
    const token = localStorage.getItem('kaarya_admin_token');

    (async () => {
      try {
        const res = await fetch(full, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return <img src={url ?? ''} alt={alt} className={className} />;
}