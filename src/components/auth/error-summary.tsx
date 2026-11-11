interface ErrorSummaryProps {
  messages: string[];
}

/** Announces form errors to screen readers as soon as they appear. */
export function ErrorSummary({ messages }: ErrorSummaryProps) {
  const unique = Array.from(new Set(messages));
  if (unique.length === 0) return null;

  return (
    <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {unique.length === 1 ? (
        <p>{unique[0]}</p>
      ) : (
        <ul className="list-disc pl-5">
          {unique.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
