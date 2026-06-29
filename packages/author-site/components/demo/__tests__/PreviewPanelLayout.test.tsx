import { render, screen, waitFor } from "@testing-library/react";
import { PreviewPanel } from "@opencode-workbench/demo-ui";

global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: async () => body,
  } as Response;
}

describe("PreviewPanel layout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("centers the scaled preview frame inside the available area", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { compiledCode: "", dependencies: [], cssImports: [] },
      }),
    );

    const { container } = render(
      <PreviewPanel
        code="export default function Demo() { return <div />; }"
        configData={{}}
        previewSize={{ width: 1024, height: 768 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTitle("预览")).toBeInTheDocument();
    });

    const previewContainer = container.querySelector(".w-full.h-full.flex");
    expect(previewContainer).toHaveClass("items-center", "justify-center");
  });
});
