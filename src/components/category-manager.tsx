import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { SearchInput } from "./search-input";
import { SectionLoading } from "./section-loading";
import { WorkspaceModal } from "./workspace-shell";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, send, notifyError } from "@/lib/api";
import { Button } from "./ui/button";
import { Field, Pagination, Retry } from "./account-page";

type Category = { id?: string; name?: string; pickProducts?: boolean };
type ProductRow = { id: string; name: string; category: string; image?: string };
export function CategoryManager({
  row,
  onSaved,
}: {
  row: Category;
  onSaved: (row: { id: string; name: string }) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(row.name ?? "");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0),
    [memberPage, setMemberPage] = useState(0);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [draftSelected, setDraftSelected] = useState<Map<string, string>>(new Map());
  const query = useDebouncedSearch(search);
  useEffect(() => {
    setPage(0);
  }, [query]);

  const members = useQuery({
    queryKey: ["private", "category-members", row.id, row.name, memberPage],
    queryFn: () =>
      api<{ rows: ProductRow[]; more: boolean }>(
        `admin/products?page=${memberPage}&category=${encodeURIComponent(row.name!)}`,
      ),
    enabled: !!row.id,
    retry: false,
  });
  const products = useQuery({
    queryKey: ["private", "category-product-picker", page, query],
    queryFn: () =>
      api<{ rows: ProductRow[]; more: boolean }>(
        `admin/products?page=${page}&q=${encodeURIComponent(query)}`,
      ),
    enabled: picking,
    retry: false,
  });
  return (
    <>
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            const result = await send<{ id: string }>("admin/categories", {
              ...(row.id ? { id: row.id } : {}),
              name: name.trim(),
              product_ids: [...selected.keys()],
            });
            toast.success(row.id ? "Category updated." : "Category created.");
            setSelected(new Map());
            await Promise.all([
              client.invalidateQueries({ queryKey: ["private", "product-category-options"] }),
              client.invalidateQueries({ queryKey: ["private", "category-members"] }),
              client.invalidateQueries({ queryKey: ["private", "category-product-picker"] }),
              client.invalidateQueries({ queryKey: ["private", "admin", "products"] }),
            ]);
            onSaved({ id: result.id, name: name.trim() });
          } catch (error) {
            notifyError(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="space-y-5">
          <Field
            label="Category name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
          {row.id && (
            <section className="space-y-3">
              <h3 className="font-semibold">Products in this category</h3>
              {members.isPending && <SectionLoading label="Loading products" compact />}
              {members.error && (
                <Retry error={members.error} retry={() => void members.refetch()} />
              )}
              {members.data?.rows.length === 0 && (
                <p className="text-sm text-muted-foreground">No products assigned yet.</p>
              )}
              <ul className="divide-y">
                {members.data?.rows.map((product) => (
                  <li className="py-2 text-sm" key={product.id}>
                    {product.name}
                  </li>
                ))}
              </ul>
              {members.data && (memberPage > 0 || members.data.more) && (
                <Pagination page={memberPage} more={members.data.more} onChange={setMemberPage} />
              )}
            </section>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraftSelected(new Map(selected));
              setPicking(true);
            }}
            aria-expanded={picking}
          >
            <Plus className="size-4" />
            Add products to category
          </Button>
          {selected.size > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{selected.size} selected</p>
              <div className="flex flex-wrap gap-2">
                {[...selected].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className="max-w-full rounded-lg bg-secondary px-3 py-1 text-left text-xs"
                    aria-label={`Unselect ${label}`}
                    onClick={() =>
                      setSelected((current) => {
                        const next = new Map(current);
                        next.delete(id);
                        return next;
                      })
                    }
                  >
                    {label} ×
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button type="submit" disabled={busy || products.isFetching}>
            {busy ? "Saving…" : row.id ? "Save category" : "Create category"}
          </Button>
        </fieldset>
      </form>
      <WorkspaceModal
        open={picking}
        onClose={() => setPicking(false)}
        title="Add products to category"
        size="medium"
      >
        <section className="space-y-3 rounded-xl border bg-secondary/30 p-3">
          <label className="block text-sm font-semibold">
            Find products
            <SearchInput
              type="search"
              className="commerce-input mt-2"
              value={search}
              onValueChange={setSearch}
              placeholder="Search product names"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Selected products will move into this category when you save.
          </p>
          {products.isPending && <SectionLoading label="Loading products" compact />}
          {products.error && <Retry error={products.error} retry={() => void products.refetch()} />}
          <ul className="max-h-64 divide-y overflow-y-auto">
            {products.data?.rows.map((product) => {
              const assigned = !!row.id && product.category === row.name;
              return (
                <li key={product.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-3 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Add ${product.name} to category`}
                      checked={assigned || draftSelected.has(product.id)}
                      disabled={assigned}
                      onChange={(event) => {
                        if (event.target.checked && draftSelected.size >= 500) {
                          toast.error("Save these products before adding more.");
                          return;
                        }
                        setDraftSelected((current) => {
                          const next = new Map(current);
                          if (event.target.checked) next.set(product.id, product.name);
                          else next.delete(product.id);
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block break-words font-semibold">{product.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {assigned ? "Already in this category" : product.category}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {products.data?.rows.length === 0 && <p className="text-sm">No products found.</p>}
          {products.data && (page > 0 || products.data.more) && (
            <Pagination page={page} more={products.data.more} onChange={setPage} />
          )}
        </section>

        <div className="flex gap-3">
          <Button
            type="button"
            onClick={() => {
              setSelected(new Map(draftSelected));
              setPicking(false);
            }}
          >
            Add selected products ({draftSelected.size})
          </Button>
          <Button type="button" variant="outline" onClick={() => setPicking(false)}>
            Cancel
          </Button>
        </div>
      </WorkspaceModal>
    </>
  );
}
