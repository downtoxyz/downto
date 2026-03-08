import React from 'react';

export default function Page({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
