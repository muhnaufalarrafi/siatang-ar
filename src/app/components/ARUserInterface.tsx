"use client";

import React from 'react'; // Diperlukan untuk JSX

/**
 * Komponen baru yang didedikasikan untuk me-render UI AR kustom.
 * Tombol-tombol ini sudah "dipercantik" dengan Tailwind.
 */
interface ARUserInterfaceProps {
  arButton: HTMLButtonElement | null;
  isSessionActive: boolean;
}

// Ekspor komponen agar bisa diimpor di page.tsx
export function ARUserInterface({ arButton, isSessionActive }: ARUserInterfaceProps) {
  
  // Fungsi untuk 'mengklik' tombol AR yang tersembunyi
  const onButtonClick = () => {
    arButton?.click();
  };

  // Tampilkan UI "START"
  if (!isSessionActive) {
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/30 backdrop-blur-md">
        <h1 className="text-white text-4xl font-bold mb-4">AR Si Atang</h1>
        <p className="text-white text-lg mb-8">Klik untuk memulai pengalaman AR</p>
        <button
          onClick={onButtonClick}
          // 'disabled' jika tombol AR (logika) belum siap
          disabled={!arButton} 
          className={`
            px-8 py-4 bg-blue-600 text-white 
            font-bold text-lg rounded-full shadow-lg 
            transition-all duration-300 
            hover:bg-blue-700 hover:scale-105
            active:scale-95
            disabled:bg-gray-500 disabled:cursor-not-allowed
          `}
        >
          {/* Tampilkan 'Checking...' jika tombol belum siap */}
          {!arButton ? "Mengecek Kompatibilitas..." : "START AR"}
        </button>
      </div>
    );
  }

  // Tampilkan UI "STOP" (saat sesi AR sedang berjalan)
  return (
    <button
      onClick={onButtonClick}
      className={`
        absolute bottom-8 left-1/2 -translate-x-1/2 z-20
        px-6 py-3 bg-red-600/80 text-white 
        font-semibold rounded-full shadow-lg backdrop-blur-sm
        transition-all duration-300 
        hover:bg-red-700/90 hover:scale-105
        active:scale-95
      `}
    >
      STOP AR
    </button>
  );
}

