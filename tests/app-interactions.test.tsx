import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/lib/mermaid", () => ({
  initMermaid: vi.fn(),
  renderMermaid: (code: string) => import("./helpers/fake-mermaid").then((m) => m.fakeRenderMermaid(code)),
  validateMermaid: (code: string) => import("./helpers/fake-mermaid").then((m) => m.fakeValidateMermaid(code)),
}));

import App from "../src/App";
import { computeFit } from "../src/components/DiagramStage";

async function mount() {
  const user = userEvent.setup();
  const utils = render(<App />);
  await waitFor(() => expect(utils.container.querySelector("svg.mp-base-svg")).toBeTruthy());
  return { user, ...utils };
}

function editor(): HTMLTextAreaElement {
  return screen.getByLabelText(/Mermaid code editor/i) as HTMLTextAreaElement;
}

function nodeHit(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-node-hit="${id}"]`);
  if (!el) throw new Error(`node hit target missing: ${id}`);
  return el;
}

async function openInspector(_user: ReturnType<typeof userEvent.setup>, id = "Cart") {
  await waitFor(() => expect(nodeHit(id)).toBeTruthy());
  await act(async () => {
    nodeHit(id).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return waitFor(() => screen.getByTestId("node-inspector"));
}

describe("node chaos inspector", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("opens on node click and shows parsed telemetry", async () => {
    const { user } = await mount();
    const panel = await openInspector(user);
    expect(within(panel).getByText("Cart API")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Degraded/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).getByText(/180 ms/)).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    const { user } = await mount();
    await openInspector(user);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("node-inspector")).toBeNull());
  });

  it("switching to Outage writes the directive and drops success rate", async () => {
    const { user } = await mount();
    const panel = await openInspector(user);
    const before = screen.getByText(/Success rate/i).nextElementSibling?.textContent ?? "";
    await user.click(within(panel).getByRole("button", { name: /Outage/i }));
    await waitFor(() => expect(editor().value).toContain("%% @node Cart status=outage"));
    await waitFor(() => {
      const after = screen.getByText(/Success rate/i).nextElementSibling?.textContent ?? "";
      expect(after).not.toBe(before);
      expect(Number.parseFloat(after)).toBeLessThan(100);
    });
  });

  it("outage turns incoming edges crimson and halts downstream pulses", async () => {
    const { user, container } = await mount();
    const panel = await openInspector(user, "Mesh");
    await user.click(within(panel).getByRole("button", { name: /Outage/i }));
    await waitFor(() => {
      const dropped = container.querySelectorAll('[data-packet^="Ingress->Mesh"]');
      expect(dropped.length).toBeGreaterThan(0);
    });
  });

  it("throughput slider writes the rps directive and changes canvas density", async () => {
    const { user, container } = await mount();
    const panel = await openInspector(user, "Catalog");
    const slider = within(panel).getByLabelText(/Target throughput/i);
    const before = container.querySelectorAll("[data-packet]").length;
    fireEvent.change(slider, { target: { value: "4000" } });
    await waitFor(() => expect(editor().value).toMatch(/%% @node Catalog .*rps=4000/));
    await waitFor(() => {
      expect(container.querySelectorAll("[data-packet]").length).not.toBe(before);
    });
  });

  it("latency slider writes the latency directive", async () => {
    const { user } = await mount();
    const panel = await openInspector(user, "Pricing");
    const slider = within(panel).getByLabelText(/Base latency/i);
    fireEvent.change(slider, { target: { value: "420" } });
    await waitFor(() => expect(editor().value).toMatch(/%% @node Pricing .*latency=420ms/));
  });
});

describe("simulation dock", () => {
  it("pauses and resumes packet animation", async () => {
    const { user, container } = await mount();
    const before = container.querySelectorAll("[data-packet]").length;
    expect(before).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Pause traffic/i }));
    await waitFor(() => expect(container.querySelectorAll("[data-packet]").length).toBe(0));
    await user.click(screen.getByRole("button", { name: /Play traffic/i }));
    await waitFor(() => expect(container.querySelectorAll("[data-packet]").length).toBeGreaterThan(0));
  });

  it("scales throughput with the load multiplier", async () => {
    const { user } = await mount();
    const read = () => screen.getByText(/Throughput/i).nextElementSibling?.textContent ?? "";
    const normal = read();
    await user.click(screen.getAllByRole("button", { name: "20x DDoS" })[0]);
    await waitFor(() => expect(read()).not.toBe(normal));
  });

  it("steps a single request hop by hop", async () => {
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: /Step request/i }));
    await waitFor(() => expect(screen.getByText(/hop 1\//)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Step request/i }));
    await waitFor(() => expect(screen.getByText(/hop 2\//)).toBeInTheDocument());
  });
});

describe("traffic modes", () => {
  it("switches between live, trace, and heatmap readouts", async () => {
    const { user } = await mount();
    await user.click(screen.getAllByRole("button", { name: "Latency Heatmap" })[0]);
    await waitFor(() => expect(screen.getByText(/>=500ms/)).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Step-by-Step Trace" })[0]);
    await waitFor(() => expect(screen.getByText(/Trace armed/i)).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Live Flow" })[0]);
    await waitFor(() => expect(screen.queryByText(/Trace armed/i)).toBeNull());
  });
});

describe("authoring", () => {
  it("switching preset replaces the code and rerenders the graph", async () => {
    const { user } = await mount();
    const select = screen.getByLabelText(/Architecture preset/i);
    await user.selectOptions(select, "kafka-pipeline");
    await waitFor(() => expect(editor().value).toContain("Kafka Event Bus"));
    expect(editor().value).not.toContain("Ingress Controller");
  });

  it("quick insert appends a database node", async () => {
    const { user } = await mount();
    const before = editor().value;
    await user.click(screen.getByRole("button", { name: /\+ Database/i }));
    await waitFor(() => expect(editor().value.length).toBeGreaterThan(before.length));
    expect(editor().value).toContain("[(New Database)]");
  });

  it("keeps the last valid diagram when syntax breaks", async () => {
    const { user, container } = await mount();
    const svgBefore = container.querySelector("svg.mp-base-svg")?.outerHTML;
    await user.click(editor());
    await user.keyboard("{Control>}a{/Control}");
    await user.paste("flowchart LR\n  A[Start] -->");
    await waitFor(() => expect(screen.getAllByText(/Line 2/i).length).toBeGreaterThan(0));
    expect(container.querySelector("svg.mp-base-svg")?.outerHTML).toBe(svgBefore);
    expect(container.querySelectorAll("[data-packet]").length).toBeGreaterThan(0);
  });

  it("shows an empty state when the source is cleared", async () => {
    const { user } = await mount();
    const editorBox = editor();
    await user.clear(editorBox);
    await waitFor(() => expect(screen.getByText(/No diagram rendered yet/i)).toBeInTheDocument());
    await user.type(editorBox, "flowchart LR{enter}  A[One] --> B[Two]");
    await waitFor(() => expect(screen.queryByText(/No diagram rendered yet/i)).toBeNull());
  });

  it("refits when a preset changes the diagram bounds", async () => {
    const wide = computeFit({ x: 0, y: 0, width: 1600, height: 500 }, { width: 900, height: 700 });
    const tall = computeFit({ x: 0, y: 0, width: 500, height: 1600 }, { width: 900, height: 700 });
    expect(wide).not.toBeNull();
    expect(tall).not.toBeNull();
    expect(wide!.scale).not.toBeCloseTo(tall!.scale, 2);
    // A tall topology must stay inside the stage, not overflow it.
    expect(1600 * tall!.scale).toBeLessThanOrEqual(700 - 140 + 1);
  });

  it("hovering a node highlights its source line", async () => {
    await mount();
    await act(async () => {
      nodeHit("Cart").dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    });
    await waitFor(() => expect(screen.getByText("Cart", { selector: "[data-linked-node]" })).toBeInTheDocument());
  });
});

describe("exports", () => {
  it("copies the mermaid source to the clipboard", async () => {
    // userEvent.setup() swaps in its own navigator.clipboard stub, so the spy
    // must be installed after setup to observe the real write.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const utils = render(<App />);
    await waitFor(() => expect(utils.container.querySelector("svg.mp-base-svg")).toBeTruthy());
    const copyButtons = screen.getAllByRole("button", { name: /Copy Mermaid/i });
    await user.click(copyButtons[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("flowchart")));
    expect(screen.getByText(/Copied source/i)).toBeInTheDocument();
  });

  it("writes the share hash to the URL", async () => {
    const { user } = await mount();
    await user.click(screen.getAllByRole("button", { name: /Share URL/i })[0]);
    await waitFor(() => expect(window.location.hash).toContain("#d="));
    expect(await screen.findByText(/Share link ready/i)).toBeInTheDocument();
  });

  it("downloads a standalone SVG", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:mock");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user } = await mount();
    await user.click(screen.getAllByRole("button", { name: /Download SVG/i })[0]);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});

describe("viewport controls", () => {
  it("zooms in and out within bounds", async () => {
    const { user } = await mount();
    const readout = screen.getByTestId("zoom-readout");
    await user.click(screen.getByRole("button", { name: /Zoom in/i }));
    await waitFor(() => expect(readout.textContent).not.toBe("100%"));
    for (let i = 0; i < 12; i += 1) {
      await user.click(screen.getByRole("button", { name: /Zoom in/i }));
    }
    expect(readout.textContent).toBe("300%");
    for (let i = 0; i < 30; i += 1) {
      await user.click(screen.getByRole("button", { name: /Zoom out/i }));
    }
    expect(readout.textContent).toBe("25%");
  });

  it("resets zoom and fits to screen", async () => {
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: /Zoom in/i }));
    await user.click(screen.getByRole("button", { name: /Reset zoom/i }));
    await waitFor(() => expect(screen.getByTestId("zoom-readout").textContent).toBe("100%"));
    await user.click(screen.getByRole("button", { name: /Fit to screen/i }));
    expect(screen.getByTestId("zoom-readout").textContent).toMatch(/%$/);
  });
});

describe("mobile workspace", () => {
  it("exposes a pane switcher on small screens", async () => {
    const { user } = await mount();
    const toggle = screen.getByRole("button", { name: /Show canvas|Show source/i });
    expect(toggle).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole("button", { name: /Show canvas|Show source/i })).toBeInTheDocument();
  });
});
