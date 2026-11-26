import { X } from "lucide-react";
import type { InputHTMLAttributes } from "react";

export function SearchInput({
  value,
  onValueChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <input
        {...props}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={`commerce-input w-full pr-11 [&::-webkit-search-cancel-button]:appearance-none ${props.className ?? ""}`}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onValueChange("")}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-lg text-slate-500 hover:text-brand"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
