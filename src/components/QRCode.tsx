'use client';

import { useEffect, useRef } from 'react';

interface QRCodeProps {
  url: string;
  size?: number;
}

/**
 * Simple QR code component using qrcode library
 * For production, consider using a more robust QR code library
 */
export default function QRCode({ url, size = 200 }: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Simple QR code generation using a service or library
    // For now, we'll use a QR code API service
    // In production, use a library like 'qrcode' or 'qrcode.react'
    
    if (canvasRef.current) {
      // Using a free QR code API
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = qrUrl;
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
          }
        }
      };
    }
  }, [url, size]);

  return (
    <div style={{ display: 'inline-block', padding: '1rem', background: 'white', borderRadius: '8px' }}>
      <canvas ref={canvasRef} width={size} height={size} />
      <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', textAlign: 'center', color: '#666' }}>
        Scan to join
      </div>
    </div>
  );
}

