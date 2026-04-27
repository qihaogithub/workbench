import React from 'react';

interface DemoProps {
  label: string;
  color: 'blue' | 'green' | 'red';
  size: 'small' | 'medium' | 'large';
}

export default function ButtonDemo({
  label,
  color,
  size,
}: DemoProps) {
  const baseStyles = 'font-medium rounded transition-colors focus:outline-none focus:ring-2';

  const colorStyles = {
    blue: 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-400',
    green: 'bg-green-500 text-white hover:bg-green-600 focus:ring-green-400',
    red: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-400',
  };

  const sizeStyles = {
    small: 'px-3 py-1 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <button
        className={`${baseStyles} ${colorStyles[color]} ${sizeStyles[size]}`}
      >
        {label}
      </button>
    </div>
  );
}
