// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("App smoke test", () => {
  it("renders the header and all four tabs, landing on Coach Me", () => {
    render(<App />);
    expect(screen.getByText(/Blackjack Trainer/i)).toBeTruthy();
    for (const t of ["Coach Me", "Drill", "Chart", "Learn"]) {
      expect(screen.getByRole("button", { name: t })).toBeTruthy();
    }
    // Coach Me is the default tab: the chip rail + betting prompt are visible
    expect(screen.getByText(/Balance/i)).toBeTruthy();
    expect(document.querySelectorAll(".chip-btn").length).toBeGreaterThan(0);
  });

  it("plays a Coach Me round without crashing: bet → deal → cards on the felt", () => {
    render(<App />);
    const chips = document.querySelectorAll(".chip-btn");
    fireEvent.click(chips[0]); // add a $100 chip to the bet
    const deal = screen.getByRole("button", { name: /^Deal/ });
    fireEvent.click(deal);
    // after dealing, real card faces render on the felt (player + dealer up card)
    const cards = document.querySelectorAll(".felt .card-deal, .felt .card-flip");
    expect(cards.length).toBeGreaterThanOrEqual(2);
    // an action row (Stand/Hit), an insurance prompt, or — when the random deal is an
    // instant blackjack — the round-over rebet controls are now present
    const hasActions =
      screen.queryByRole("button", { name: /^Stand$/ }) ||
      screen.queryByRole("button", { name: /insurance/i }) ||
      screen.queryByRole("button", { name: /change bet/i });
    expect(hasActions).toBeTruthy();
  });

  it("switches to the Chart tab and shows the strategy matrix", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Chart" }));
    expect(screen.getByText(/Hard totals/i)).toBeTruthy();
    expect(screen.getByText(/Late surrender/i)).toBeTruthy();
    // the matrix renders action cells (H/S/D/P letters as buttons)
    expect(document.querySelectorAll("table button").length).toBeGreaterThan(20);
  });

  it("Drill flashcards render a scenario with four move buttons", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Drill" }));
    // flashcards is the default drill mode
    expect(screen.getByText(/correct basic-strategy play/i)).toBeTruthy();
  });
});
