"use client";

import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Offset of the `[ ]` / `[x]` box inside a list item that starts at `start`. */
function boxOffset(source: string, start: number): number {
  const m = /\[( |x|X)\]/.exec(source.slice(start, start + 40));
  return m ? start + m.index : -1;
}

export function Markdown({
  source,
  className = "prose-doc",
  onToggleTask,
}: {
  source: string;
  className?: string;
  onToggleTask?: (offset: number, checked: boolean) => void;
}) {
  const components: Components = {
    li({ node, className: cls, children, ...rest }) {
      if (!cls?.includes("task-list-item")) return <li {...rest}>{children}</li>;
      const start = node?.position?.start.offset ?? -1;
      const at = start >= 0 ? boxOffset(source, start) : -1;
      const checked = at >= 0 && /x/i.test(source[at + 1]);
      const kids = Children.toArray(children).filter(
        (c) => !(isValidElement(c) && c.type === "input"),
      ) as ReactNode[];
      return (
        <li className="task-item">
          <button
            type="button"
            className="task-box"
            data-checked={checked}
            aria-pressed={checked}
            disabled={!onToggleTask || at < 0}
            onClick={() => onToggleTask?.(at, !checked)}
          >
            {checked ? "✓" : ""}
          </button>
          <span className={checked ? "text-secondary line-through decoration-[var(--color-border-strong)]" : undefined}>
            {kids}
          </span>
        </li>
      );
    },
    table({ node: _node, ...rest }) {
      void _node;
      return (
        <div className="table-wrap">
          <table {...rest} />
        </div>
      );
    },
    a({ children, ...rest }) {
      return (
        <a {...rest} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
  };

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
