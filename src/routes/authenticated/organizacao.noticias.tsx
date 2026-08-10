import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Newspaper } from "lucide-react";
import { OrganizationPublicationCard } from "@/components/organization/OrganizationPublicationCard";
import { CreatePublicationDialog } from "@/components/organization/CreatePublicationDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { setStoredActiveLibraryId } from "@/contexts/library-context";
import { useAuthContext } from "@/contexts/AuthContext";
import { usePublications, type PublicationRecord } from "@/hooks/usePublications";

export const Route = createFileRoute("/authenticated/organizacao/noticias")({
  component: OrganizationNewsPage,
});

function OrganizationNewsPage() {
  const navigate = useNavigate();
  const { profile } = useAuthContext();
  const publications = usePublications();

  // TODO: ajuste para o campo real de permissão do seu `profile`
  // (mesma observação feita em organizacao.tsx)
  const isAdmin = profile?.role === "admin";

  async function handleOpenPublication(publication: PublicationRecord) {
    if (publication.documento_id && publication.documento?.library_id) {
      setStoredActiveLibraryId(publication.documento.library_id);
      await navigate({
        to: "/authenticated/biblioteca/$bibliotecaId/documentos/$documentId",
        params: {
          bibliotecaId: publication.documento.library_id,
          documentId: publication.documento_id,
        },
      });
      return;
    }

    await navigate({ to: "/authenticated/organizacao" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-gradient-to-r from-[#061d3d] via-[#0b2f63] to-[#0f766e] p-6 text-white lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-blue-100/85">
            <Newspaper className="h-4 w-4" />
            <span className="text-sm">Publicações da organização</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Notícias e publicações
          </h1>
          <p className="max-w-2xl text-sm text-blue-100/80">
            Comunicados, manuais e procedimentos recentes para consulta rápida.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <CreatePublicationDialog
              onCreate={publications.createPublication}
              onAttachImage={publications.updatePublicationImage}
            />
          )}
          <Button asChild variant="secondary" className="gap-2">
            <Link to="/authenticated/organizacao">
              <ArrowLeft className="h-4 w-4" />
              Voltar para bibliotecas
            </Link>
          </Button>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Todas as publicações</CardTitle>
          <CardDescription>
            As publicações mais recentes aparecem primeiro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {publications.publications.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {publications.publications.map((publication) => (
                <OrganizationPublicationCard
                  key={publication.id}
                  publication={publication}
                  isAdmin={isAdmin}
                  onUpdateImage={publications.updatePublicationImage}
                  onRemoveImage={publications.removePublicationImage}
                  onOpen={() => {
                    void handleOpenPublication(publication);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-500">
              Nenhuma publicação disponível no momento.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
