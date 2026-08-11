import type { ReactNode, AnchorHTMLAttributes } from "react";
import { Link, createLink } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

type CommonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  documentId?: string | null;
  externalLink?: string | null;
  hash?: string;
  children: ReactNode;
  className?: string;
  showExternalIcon?: boolean;
};

const InternalDocumentLink = createLink({
  to: "/authenticated/documents/$documentId",
});

export function DocumentRouterLink({
  documentId,
  externalLink,
  hash,
  children,
  className,
  showExternalIcon = true,
  onClick,
  ...rest
}: CommonProps) {
  const normalizedExternal = externalLink?.trim() || null;
  if (normalizedExternal) {
    return (
      <a
        href={normalizedExternal}
        target="_blank"
        rel="noopener noreferrer"
        className={
          className ??
          "inline-flex items-center gap-1.5 text-inherit underline-offset-2 hover:underline"
        }
        onClick={onClick}
        {...(rest as any)}
      >
        {children}
        {showExternalIcon ? (
          <ExternalLink className="inline h-3.5 w-3.5 opacity-60" />
        ) : null}
      </a>
    );
  }

  if (!documentId) {
    return (
      <span className={className ?? "text-inherit"} {...(rest as any)}>
        {children}
      </span>
    );
  }

  return (
    <InternalDocumentLink
      params={{ documentId }}
      hash={hash}
      className={className ?? "text-inherit underline-offset-2 hover:underline"}
      onClick={onClick as any}
      {...(rest as any)}
    >
      {children}
    </InternalDocumentLink>
  );
}
