import React from 'react';

interface DemoProps {
  title: string;
  description: string;
  banner?: string;
  avatar?: string;
  gallery?: Array<{ url: string; alt?: string }>;
}

export default function Demo({ title, description, banner, avatar, gallery = [] }: DemoProps) {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      {banner && (
        <img
          src={banner}
          alt="banner"
          className="w-full h-64 object-cover rounded-xl mb-6 shadow-lg"
        />
      )}

      <div className="flex items-center gap-4 mb-6">
        {avatar && (
          <img
            src={avatar}
            alt="avatar"
            className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
          />
        )}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-lg text-gray-600 mt-1">{description}</p>
        </div>
      </div>

      {gallery.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Gallery</h2>
          <div className="grid grid-cols-3 gap-4">
            {gallery.map((item, index) => (
              <div key={index} className="aspect-square rounded-lg overflow-hidden shadow">
                <img
                  src={item.url}
                  alt={item.alt || `gallery-${index}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
