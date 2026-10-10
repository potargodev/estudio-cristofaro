import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Cuerpo de un artículo de ayuda (Markdown de docs/ayuda, contenido propio del repo) */
export function HelpMarkdown({ text }: { text: string }) {
  return (
    <div className="text-[16px] leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = "", children }) =>
            href.startsWith("/") ? (
              <Link href={href} className="font-medium text-rose-deep underline underline-offset-4">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="font-medium text-rose-deep underline underline-offset-4">
                {children}
              </a>
            ),
          h1: ({ children }) => <h2 className="mt-8 text-[22px] font-semibold">{children}</h2>,
          h2: ({ children }) => <h2 className="mt-8 text-[22px] font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-6 text-[18px] font-semibold">{children}</h3>,
          p: ({ children }) => <p className="mt-3">{children}</p>,
          ul: ({ children }) => <ul className="mt-3 list-disc space-y-1.5 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1.5 pl-6">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="mt-4 rounded-md border-l-4 border-rose-light bg-navy-soft px-4 py-2 text-[15px]">{children}</blockquote>,
          code: ({ children }) => <code className="rounded bg-navy-soft px-1.5 py-0.5 text-[14px]">{children}</code>,
          table: ({ children }) => (
            <div className="mt-4 overflow-x-auto rounded-md border border-line">
              <table className="w-full text-left text-[14px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-line bg-canvas px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b border-line px-3 py-2 align-top">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
