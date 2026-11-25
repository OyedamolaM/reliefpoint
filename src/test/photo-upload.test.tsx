import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const upload = vi.hoisted(() => ({ file: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/upload", () => ({ uploadFile: upload.file }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  notifyError: upload.error,
}));
import { PhotoUpload } from "@/components/admin-page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  upload.file.mockReset();
  upload.error.mockReset();
});

describe("photo upload field", () => {
  it("shows a preview and progress until photo processing finishes", async () => {
    let finish!: (result: { images: { medium: string } }) => void;
    upload.file.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:photo-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const change = vi.fn(),
      busy = vi.fn();
    const { unmount } = render(
      <PhotoUpload value="" label="Product photo" onChange={change} onUploadingChange={busy} />,
    );
    expect(screen.getByText("No photo chosen")).toBeVisible();
    const input = screen.getByLabelText("Product photo");
    const picker = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Choose photo" }));
    expect(picker).toHaveBeenCalledOnce();
    fireEvent.change(input, {
      target: { files: [new File(["image"], "vitamins.png", { type: "image/png" })] },
    });
    expect(screen.getByRole("progressbar", { name: "Uploading product photo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    expect(screen.getByText("vitamins.png")).toBeVisible();
    expect(screen.getByRole("img", { name: "Product photo preview" })).toHaveAttribute(
      "src",
      "blob:photo-preview",
    );
    expect(change).not.toHaveBeenCalled();
    finish({ images: { medium: "/photos/vitamins.webp" } });
    await waitFor(() => expect(change).toHaveBeenCalledWith("/photos/vitamins.webp"));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(busy.mock.calls).toEqual([[true], [false]]);
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:photo-preview");
  });

  it("keeps the previous photo and allows retry after an upload fails", async () => {
    upload.file.mockRejectedValue(new Error("Upload interrupted"));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:failed"),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const change = vi.fn();
    render(<PhotoUpload value="/photos/existing.webp" label="Product photo" onChange={change} />);
    fireEvent.change(screen.getByLabelText("Product photo"), {
      target: { files: [new File(["image"], "new.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(upload.error).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Change photo" })).toBeEnabled();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/photos/existing.webp");
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
