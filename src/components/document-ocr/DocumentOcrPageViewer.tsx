import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatDocumentOcrPercent,
  getDocumentOcrPrimaryText,
  type DocumentOcrPage,
} from "@/lib/documentOcr";
import { DocumentOcrMethodBadge } from "./DocumentOcrMethodBadge";
import { DocumentOcrPageStatusBadge } from "./DocumentOcrStatusBadge";
import { DocumentOcrWarnings } from "./DocumentOcrWarnings";

export function DocumentOcrPageViewer({
  pages,
}: {
  pages: DocumentOcrPage[];
}) {
  if (!pages.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Páginas</CardTitle>
          <CardDescription>
            Nenhum resultado por página foi registrado para este job.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Texto por página</CardTitle>
        <CardDescription>
          Texto observado por página. Páginas sem texto não são tratadas como
          documento vazio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pages
          .slice()
          .sort((left, right) => left.pageNumber - right.pageNumber)
          .map((page) => {
            const text = getDocumentOcrPrimaryText(page);
            return (
              <section key={page.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium">Página {page.pageNumber}</h3>
                    <p className="text-xs text-muted-foreground">
                      Confiança: {formatDocumentOcrPercent(page.confidence)}
                      {page.textHash ? ` · hash ${page.textHash.slice(0, 12)}…` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <DocumentOcrPageStatusBadge status={page.status} />
                    <DocumentOcrMethodBadge method={page.method} />
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-muted p-3">
                  {text ? (
                    <pre className="max-h-72 whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {text}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sem texto extraído nesta página. Isso não significa que a
                      página esteja vazia; confira o arquivo original.
                    </p>
                  )}
                </div>

                <div className="mt-3">
                  <DocumentOcrWarnings
                    warnings={page.warnings}
                    errors={page.errors}
                  />
                </div>
              </section>
            );
          })}
      </CardContent>
    </Card>
  );
}
