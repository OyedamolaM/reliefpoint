import { SectionLoading } from "./section-loading";
import { useEffect, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { api, notifyError } from "@/lib/api";
import { uploadFile } from "@/lib/upload";
import { WorkspaceModal } from "./workspace-shell";

export function PaymentPhotoUpload({
  orderId,
  onChange,
  onBusyChange,
}: {
  orderId: string;
  onChange: (id: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [preview, setPreview] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <div className="space-y-2 sm:col-span-2">
      <p className="text-sm font-semibold">Payment photo (optional)</p>
      <div className="flex items-center gap-3 rounded-xl border p-3">
        {preview ? (
          <img
            src={preview}
            alt="Selected payment proof"
            className="size-16 shrink-0 rounded-lg border object-contain"
          />
        ) : (
          <ImagePlus className="size-10 shrink-0 text-brand/60" aria-hidden="true" />
        )}
        <div className="min-w-0 space-y-1">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
            <Upload size={15} />
            {busy ? "Uploading..." : "Choose photo"}
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              aria-label="Payment photo"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                onBusyChange(true);
                try {
                  const result = await uploadFile<{ id: string }>("payment", file, orderId);
                  onChange(result.id);
                  setPreview(URL.createObjectURL(file));
                  setName(file.name);
                } catch (error) {
                  notifyError(error);
                } finally {
                  setBusy(false);
                  onBusyChange(false);
                }
              }}
            />
          </label>
          <p className="break-all text-xs text-muted-foreground">{name || "JPEG or PNG"}</p>
          {preview && (
            <button
              type="button"
              className="text-xs text-red-700 underline"
              onClick={() => {
                onChange(null);
                setPreview("");
                setName("");
              }}
            >
              Remove photo
            </button>
          )}
        </div>
      </div>
      {busy && (
        <div
          role="progressbar"
          aria-label="Uploading payment photo"
          className="h-1.5 overflow-hidden rounded-full bg-blue-100"
        >
          <div className="h-full w-2/3 animate-pulse bg-brand" />
        </div>
      )}
    </div>
  );
}
export function PaymentPhotoButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false);
  const load = async () => {
    setFailed(false);
    try {
      const result = await api<{ url: string }>(`admin/payment-evidence/${id}`);
      setUrl(result.url);
    } catch (error) {
      setFailed(true);
      notifyError(error);
    }
  };
  return (
    <>
      <button
        type="button"
        className="ml-2 text-brand underline"
        onClick={() => {
          setUrl("");
          setOpen(true);
          void load();
        }}
      >
        View payment photo
      </button>
      <WorkspaceModal
        open={open}
        onClose={() => setOpen(false)}
        title="Payment photo"
        size="medium"
      >
        {url ? (
          <img
            src={url}
            alt="Payment proof"
            className="max-h-[70dvh] w-full object-contain"
            onError={() => {
              setUrl("");
              setFailed(true);
            }}
          />
        ) : failed ? (
          <button type="button" className="action-button" onClick={() => void load()}>
            Retry
          </button>
        ) : (
          <SectionLoading label="Loading photo" />
        )}
      </WorkspaceModal>
    </>
  );
}
