import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/lib/mermaid", () => ({
  initMermaid: vi.fn(),
  renderMermaid: (code: string) => import("./helpers/fake-mermaid").then((m) => m.fakeRenderMermaid(code)),
  validateMermaid: (code: string) => import("./helpers/fake-mermaid").then((m) => m.fakeValidateMermaid(code)),
}));

import App from "../src/App";

async function mount() {
  const user = userEvent.setup();
  const utils = render(<App />);
  await waitFor(() => expect(utils.container.querySelector("svg.mp-base-svg")).toBeTruthy());
  return { user, ...utils };
}

describe("MermaidPulse shell", () => {
  it("locks the workspace to the viewport", async () => {
    const { container } = await mount();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("h-screen");
    expect(root.className).toContain("w-screen");
    expect(root.className).toContain("overflow-hidden");
  });

  it("renders the brand, editor, canvas, and telemetry dock", async () => {
    await mount();
    expect(screen.getByRole("heading", { name: /MermaidPulse/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Mermaid code editor/i)).toBeInTheDocument();
    expect(screen.getByTestId("diagram-stage")).toBeInTheDocument();
    expect(screen.getByTestId("telemetry-dock")).toBeInTheDocument();
  });

  it("starts with a populated, animated diagram", async () => {
    const { container } = await mount();
    await waitFor(() => {
      expect(container.querySelectorAll("[data-packet]").length).toBeGreaterThan(0);
    });
    expect(container.querySelectorAll("[data-heartbeat]").length).toBeGreaterThan(2);
  });

  it("has no dead controls in the header", async () => {
    await mount();
    const header = screen.getByTestId("app-header");
    for (const button of within(header).getAllByRole("button")) {
      expect(button).not.toHaveAttribute("disabled");
    }
  });
});
