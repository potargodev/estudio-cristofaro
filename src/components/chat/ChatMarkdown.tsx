"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Respuestas del Vigía y del Asistente: Markdown con tablas, sin HTML crudo; los links internos navegan dentro de la app */
export default function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="faro-md text-body leading-relaxed text-ink [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-max border-collapse text-left text-ui">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-line bg-canvas px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => <td className="tabular border-b border-line px-3 py-2 align-top">{children}</td>,
          a: ({ href = "", children }) =>
            href.startsWith("/") && !href.startsWith("//") ? (
              <Link href={href} className="underline underline-offset-4 hover:text-rose-deep">
                {children}
              </Link>
            ) : (
              <a href={href} className="underline underline-offset-4 hover:text-rose-deep" target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
          code: ({ children }) => <code className="bg-navy-soft px-1 font-mono text-meta">{children}</code>,
          pre: ({ children }) => <pre className="my-3 overflow-x-auto bg-navy-soft p-3 font-mono text-meta">{children}</pre>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          h1: ({ children }) => <h3 className="mb-2 mt-4 text-title font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-2 mt-4 text-lead font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-1 mt-3 text-body font-semibold">{children}</h4>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
