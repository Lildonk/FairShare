interface HeadingProps {
  children: React.ReactNode;
  level?: 1 | 2 | 3 | 4;
  className?: string;
}

/**
 * Reusable heading component with semantic HTML levels.
 */
export function Heading({
  children,
  level = 1,
  className = '',
}: HeadingProps) {
  const Tag = `h${level}` as const;
  return <Tag className={className}>{children}</Tag>;
}

