"use client";

import type { CSSProperties, ReactNode } from "react";

export function SourceCardRoot({
  href,
  onClick,
  children,
  className,
  style,
  id,
  testId = "source-card",
  relevance,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className: string;
  style?: CSSProperties;
  id?: string;
  testId?: string;
  relevance?: string;
}) {
  if (href) {
    return (
      <a
        id={id}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={testId}
        data-relevance={relevance}
        className={className}
        style={style}
      >
        {children}
      </a>
    );
  }

  const interactive = Boolean(onClick);
  if (interactive) {
    return (
      <button
        id={id}
        type="button"
        data-testid={testId}
        data-relevance={relevance}
        onClick={onClick}
        className={className}
        style={style}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      id={id}
      data-testid={testId}
      data-relevance={relevance}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}
