import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Heading } from './heading';

describe('Heading component', () => {
  it('renders children text', () => {
    render(<Heading>FairShare</Heading>);
    expect(screen.getByText('FairShare')).toBeInTheDocument();
  });

  it('renders as h1 by default', () => {
    render(<Heading>Title</Heading>);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Title');
  });

  it('renders at the specified heading level', () => {
    render(<Heading level={3}>Subtitle</Heading>);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Heading className="text-xl font-bold">Styled</Heading>);
    const heading = screen.getByRole('heading');
    expect(heading).toHaveClass('text-xl', 'font-bold');
  });
});

