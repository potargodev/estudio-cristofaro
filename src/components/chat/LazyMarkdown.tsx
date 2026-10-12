"use client";

import dynamic from "next/dynamic";

// react-markdown y remark-gfm en un chunk aparte: se baja recién cuando hay una respuesta para mostrar
export const ChatMarkdown = dynamic(() => import("./ChatMarkdown"), {
  loading: () => <span className="block h-4 w-2/3 animate-pulse rounded-md bg-navy-soft" aria-hidden />,
});
