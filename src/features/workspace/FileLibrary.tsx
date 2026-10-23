import { FileText, UploadCloud } from "lucide-react";
import { PageHeading } from "../../components/PageHeading";
import type { TranslationKey } from "../../i18n";

type Translator = (key: TranslationKey) => string;

export function FileLibrary({
  t,
  canOpenDocuments,
  onOpenDocuments,
}: {
  t: Translator;
  canOpenDocuments: boolean;
  onOpenDocuments: () => void;
}) {
  return (
    <section>
      <PageHeading
        eyebrow={t("fileLibrary")}
        title={t("fileLibrary")}
        detail={t("fileLibraryDetail")}
        action={
          <button
            type="button"
            className="primary-btn"
            disabled={!canOpenDocuments}
            onClick={onOpenDocuments}
          >
            <UploadCloud size={16} /> {t("openDocumentWorkspace")}
          </button>
        }
      />
      <section className="panel file-library-entry">
        <FileText size={24} aria-hidden="true" />
        <p>{canOpenDocuments ? t("fileLibraryRealDocuments") : t("permissionDenied")}</p>
        {canOpenDocuments && (
          <button
            type="button"
            className="outline-btn"
            onClick={onOpenDocuments}
          >
            {t("openDocumentWorkspace")}
          </button>
        )}
      </section>
    </section>
  );
}
