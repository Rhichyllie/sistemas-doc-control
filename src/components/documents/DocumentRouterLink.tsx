import type { ReactNode, AnchorHTMLAttributes } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

type CommonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  documentId?: string | null;
  externalLink?: string | null;
  hash?: string;
  children: ReactNode;
  className?: string;
  showExternalIcon?: boolean;
};

// FIX: o código anterior usava `createLink({ to: "..." })`, mas createLink()
// do @tanstack/react-router não aceita um objeto de opções de rota — ele
// espera um COMPONENTE (tipicamente um forwardRef) para "envolver" com
// capacidades de roteamento. Passar `{ to: ... }` fazia createLink devolver
// algo que não é um componente React válido, o que quebrava a renderização
// com "Element type is invalid ... but got: object. Check the render method
// of `ForwardRef`." sempre que este link era renderizado (Dashboard e
// Central Documental, via WorkItemCard). O <Link> padrão do tanstack-router
// já aceita to/params/hash/className/onClick diretamente, então não havia
// necessidade de createLink aqui.

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
    <Link
      to="/authenticated/documents/$documentId"
      params={{ documentId }}
      hash={hash}
      className={className ?? "text-inherit underline-offset-2 hover:underline"}
      onClick={onClick as any}
      {...(rest as any)}
    >
      {children}
    </Link>
  );
}
