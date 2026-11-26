import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatNaira, type Product } from "@/lib/commerce";
import type { CustomerChoice } from "./customer-form";
import { WorkspaceModal } from "./workspace-shell";
import { Field, Pagination, Retry } from "./account-page";
import { Button } from "./ui/button";
import { QuantitySelector } from "./quantity-selector";
export type OrderItem = { product: Product; quantity: number };
function usePickerSearch() {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);
  return { search, setSearch, query, page, setPage };
}
export function OrderCustomerPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (customer: CustomerChoice) => void;
}) {
  const { search, setSearch, query, page, setPage } = usePickerSearch();
  const customers = useQuery({
    queryKey: ["private", "order-customer-picker", query, page],
    queryFn: () =>
      api<{ rows: CustomerChoice[]; more: boolean }>(
        `admin/profiles?page=${page}&q=${encodeURIComponent(query)}`,
      ),
    enabled: open,
    retry: false,
  });
  return (
    <WorkspaceModal open={open} onClose={onClose} title="Select customer" size="medium">
      <Field
        label="Search customers"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {customers.error && <Retry error={customers.error} retry={() => void customers.refetch()} />}
      {customers.isPending && <p>Loading customers…</p>}
      <ul className="max-h-80 divide-y overflow-y-auto">
        {customers.data?.rows.map((customer) => (
          <li key={customer.id}>
            <button
              type="button"
              className="w-full rounded-lg p-3 text-left hover:bg-secondary"
              onClick={() => {
                onSelect(customer);
                onClose();
              }}
            >
              <strong className="block">{customer.name || customer.email}</strong>
              <span className="block break-all text-sm text-muted-foreground">
                {customer.email}
              </span>
              <span className="text-sm text-muted-foreground">{customer.phone}</span>
            </button>
          </li>
        ))}
      </ul>
      {customers.data?.rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No customers found.</p>
      )}
      {customers.data && (page > 0 || customers.data.more) && (
        <Pagination page={page} more={customers.data.more} onChange={setPage} />
      )}
    </WorkspaceModal>
  );
}
export function OrderProductPicker({
  open,
  onClose,
  items,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  items: OrderItem[];
  onSelect: (items: OrderItem[]) => void;
}) {
  const { search, setSearch, query, page, setPage } = usePickerSearch();
  const [selected, setSelected] = useState<OrderItem[]>(items);
  useEffect(() => {
    if (open) setSelected(items);
  }, [open]);
  const catalog = useQuery({
    queryKey: ["private", "admin-order-products", query, page],
    queryFn: () =>
      api<{ products: Product[]; configured: boolean; more: boolean }>(
        `catalog?stock=1&q=${encodeURIComponent(query)}&page=${page}`,
      ),
    enabled: open,
    staleTime: 60000,
    retry: false,
  });
  return (
    <WorkspaceModal open={open} onClose={onClose} title="Select products" size="medium">
      <Field
        label="Search products"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {catalog.error && <Retry error={catalog.error} retry={() => void catalog.refetch()} />}
      {catalog.isPending && <p>Loading products…</p>}
      <ul className="max-h-80 divide-y overflow-y-auto">
        {catalog.data?.configured &&
          catalog.data.products.map((product) => {
            const current = selected.find((item) => item.product.id === product.id);
            return (
              <li
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Select ${product.name}`}
                    checked={!!current}
                    disabled={!current && selected.length >= 50}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, { product, quantity: 1 }]
                          : selected.filter((item) => item.product.id !== product.id),
                      )
                    }
                  />
                  <span>
                    <strong className="block">{product.name}</strong>
                    {formatNaira(product.price)}
                  </span>
                </label>
                {current && (
                  <QuantitySelector
                    name={product.name}
                    value={current.quantity}
                    onChange={(quantity) =>
                      setSelected(
                        selected.map((item) =>
                          item.product.id === product.id ? { ...item, quantity } : item,
                        ),
                      )
                    }
                  />
                )}
              </li>
            );
          })}
      </ul>
      {catalog.data && (!catalog.data.configured || !catalog.data.products.length) && (
        <p className="text-sm text-muted-foreground">No available products found.</p>
      )}
      {catalog.data && (page > 0 || catalog.data.more) && (
        <Pagination page={page} more={catalog.data.more} onChange={setPage} />
      )}
      <Button
        type="button"
        onClick={() => {
          onSelect(selected);
          onClose();
        }}
      >
        Add selected products ({selected.length})
      </Button>
    </WorkspaceModal>
  );
}
