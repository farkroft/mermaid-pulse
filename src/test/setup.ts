import "@testing-library/jest-dom/vitest";

// jsdom lacks a layout engine: ResizeObserver and SVG geometry return inert stubs.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub });
}

// jsdom has no layout engine; SVG geometry calls used by the overlay return zeros.
if (!("getBBox" in SVGElement.prototype)) {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value(this: SVGElement) {
      const rect = this.querySelector("rect");
      const x = Number(rect?.getAttribute("x") ?? 0);
      const y = Number(rect?.getAttribute("y") ?? 0);
      const w = Number(rect?.getAttribute("width") ?? 120);
      const h = Number(rect?.getAttribute("height") ?? 40);
      return { x, y, width: w, height: h };
    },
  });
}
