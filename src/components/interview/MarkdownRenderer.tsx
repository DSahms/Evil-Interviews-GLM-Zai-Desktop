'use client'

import ReactMarkdown from 'react-markdown'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * Simple markdown renderer — converts markdown to HTML in the literary style
 * established by globals.css. Does not handle images, code blocks are rendered
 * as pre/code.
 */
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-renderer ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="font-serif text-2xl text-foreground mt-4 mb-3">{children}</h1>,
          h2: ({ children }) => <h2 className="font-serif text-xl text-foreground mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="font-serif text-lg text-foreground mt-2 mb-2">{children}</h3>,
          p: ({ children }) => <p className="text-foreground leading-relaxed mb-3 first-line:indent-4">{children}</p>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent/50 pl-4 italic text-muted-foreground my-3">{children}</blockquote>
          ),
          ul: ({ children }) => <ul className="list-disc pl-6 mb-3 text-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-3 text-foreground">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed mb-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic text-foreground">{children}</em>,
          code: ({ children }) => <code className="font-mono text-sm bg-muted px-1 py-0.5 rounded">{children}</code>,
          hr: () => <hr className="border-border my-4" />,
          a: ({ children, href }) => <a href={href} className="text-primary underline">{children}</a>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
